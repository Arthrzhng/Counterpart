/*
 * Cognitive Dimension Classifier — Design Notes
 *
 * WHY EMA FOR V1
 * A single classifier call per message would produce noisy, message-level scores
 * that swing with topic or phrasing rather than reflecting stable cognitive style.
 * Exponential Moving Average (α = 0.3) smooths that noise: recent evidence moves
 * the score meaningfully, but a single outlier message can't flip the profile.
 * EMA is also stateless — no window to manage, no database reads in the hot path —
 * which makes it cheap and easy to reason about.
 *
 * KNOWN LIMITATIONS
 * 1. Recency weighting is prompt-based, not mathematical. The classifier is told
 *    to apply 3× weight to messages labelled [RECENT], but nothing enforces this
 *    numerically. In practice the model follows the instruction, but the effective
 *    weight varies with context length and model behaviour across versions.
 *
 * 2. Cold-start inaccuracy on the first 1–3 messages. With very little signal,
 *    the classifier's scores are underconfident and often regress toward the centre
 *    of each scale. EMA blending with the default scores (all 0 / 0.5) amplifies
 *    this: early scores are partly a weighted average of the real signal and an
 *    uninformative prior. The UI should treat early scores as provisional.
 *
 * WHAT V2 LOOKS LIKE
 * The right long-term approach is a fine-tuned classifier trained on correction
 * data collected from this product. Every time a user edits a dimension score
 * manually or deletes a dimension (signalling the classifier got it wrong), that
 * is a labelled training example: (conversation_history, classifier_score,
 * user_correction). After enough of these are collected, a fine-tuned model can
 * be trained to produce scores that are calibrated to real user feedback rather
 * than a rubric written in a system prompt. V2 should also compute recency
 * weighting externally (run the classifier per sliding window, then compute a
 * proper weighted average) so the weighting is mathematically enforced rather
 * than instruction-dependent.
 */

import Anthropic from "@anthropic-ai/sdk";

const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

const CLASSIFY_SYSTEM_PROMPT = `You are a cognitive pattern classifier. Analyse user messages from a conversation and score the user on 6 dimensions. Output only a raw JSON object — no explanation, no markdown, no code fences.

DIMENSIONS:

abstract_vs_concrete (−1 to +1)
  −1 Concrete: asks for specific steps, implementation details, examples, or data; grounds thinking in facts and tangibles
  +1 Abstract: reasons in principles, frameworks, or metaphors; comfortable with ambiguity; prefers high-level to specifics

validation_vs_truth (−1 to +1)
  −1 Truth-seeking: actively invites challenge or counter-argument; willing to have their position overturned; frames questions openly
  +1 Validation-seeking: phrases questions to confirm what they already believe; resists or ignores pushback; rationalises rather than reconsiders

divergent_vs_convergent (−1 to +1)
  −1 Convergent: narrows to one answer quickly; pushes for a decision; uncomfortable with open options
  +1 Divergent: generates many possibilities before committing; avoids closure; explores breadth over depth

cautious_vs_decisive (−1 to +1)
  −1 Cautious: hedges heavily; adds caveats; wants more information before acting; prioritises avoiding mistakes
  +1 Decisive: commits quickly; tolerates uncertainty; willing to act without full information

conflict_avoidant_vs_direct (−1 to +1)
  −1 Conflict-avoidant: softens disagreement; over-hedges when challenged; avoids tension even when it would serve them
  +1 Direct: states disagreement plainly; challenges assumptions openly; comfortable with blunt exchanges

knowledge_confidence (0 to 1)
  0   Uncertain: frequently expresses doubt; acknowledges knowledge gaps; asks basic clarifying questions
  0.5 Mixed: confident in some areas, uncertain in others
  1   Confident: states things with certainty; rarely acknowledges gaps; deploys domain vocabulary comfortably

WEIGHTING: User messages marked [RECENT] count 3× more than earlier messages in your final scores.

Return exactly this JSON shape with numeric values only, no other text:
{"abstract_vs_concrete":0.0,"validation_vs_truth":0.0,"divergent_vs_convergent":0.0,"cautious_vs_decisive":0.0,"conflict_avoidant_vs_direct":0.0,"knowledge_confidence":0.5}`;

// Classifier output — all fields always present as numbers
export type RawDimensionScores = {
  abstract_vs_concrete: number;
  validation_vs_truth: number;
  divergent_vs_convergent: number;
  cautious_vs_decisive: number;
  conflict_avoidant_vs_direct: number;
  knowledge_confidence: number;
};

// Stored scores — null means the user deleted that dimension (Counterpart ignores it)
export type DimensionScores = {
  abstract_vs_concrete: number | null;
  validation_vs_truth: number | null;
  divergent_vs_convergent: number | null;
  cautious_vs_decisive: number | null;
  conflict_avoidant_vs_direct: number | null;
  knowledge_confidence: number | null;
};

export type ClassifierMessage = {
  role: "user" | "assistant";
  content: string;
};

let anthropic: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropic) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY.");
    anthropic = new Anthropic({ apiKey });
  }
  return anthropic;
}

export function isRawDimensionScores(value: unknown): value is RawDimensionScores {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.abstract_vs_concrete === "number" &&
    typeof v.validation_vs_truth === "number" &&
    typeof v.divergent_vs_convergent === "number" &&
    typeof v.cautious_vs_decisive === "number" &&
    typeof v.conflict_avoidant_vs_direct === "number" &&
    typeof v.knowledge_confidence === "number"
  );
}

export function isDimensionScores(value: unknown): value is DimensionScores {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const keys = [
    "abstract_vs_concrete",
    "validation_vs_truth",
    "divergent_vs_convergent",
    "cautious_vs_decisive",
    "conflict_avoidant_vs_direct",
    "knowledge_confidence",
  ];
  return keys.every((k) => typeof v[k] === "number" || v[k] === null);
}

export function buildClassifierInput(messages: ClassifierMessage[]): string | null {
  const userMessages = messages.filter(
    (m) => m.role === "user" && m.content.trim().length > 0,
  );

  if (userMessages.length === 0) return null;

  const recentCount = 3;
  const splitPoint = Math.max(0, userMessages.length - recentCount);
  const earlier = userMessages.slice(0, splitPoint);
  const recent = userMessages.slice(splitPoint);

  const parts: string[] = [];

  earlier.forEach((m, i) => {
    parts.push(`[EARLIER ${i + 1}]\n${m.content}`);
  });

  recent.forEach((m, i) => {
    parts.push(`[RECENT ${splitPoint + i + 1}]\n${m.content}`);
  });

  // V1 limitation: recency weighting is communicated via prompt labels and relies on the
  // model applying 3× weight consistently, which is not mathematically enforced.
  // V2 should run the classifier per-message (or per-window) and compute a proper
  // weighted average externally, once we have enough labelled data to validate that
  // the scoring rubric is consistent enough across calls to make averaging meaningful.
  return parts.join("\n\n");
}

export async function runClassifier(
  messages: ClassifierMessage[],
): Promise<RawDimensionScores | null> {
  const input = buildClassifierInput(messages);
  if (!input) return null;

  const response = await getAnthropicClient().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 256,
    system: CLASSIFY_SYSTEM_PROMPT,
    messages: [{ role: "user", content: input }],
  });

  const rawText = response.content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const parsed = JSON.parse(cleaned) as unknown;
  return isRawDimensionScores(parsed) ? parsed : null;
}
