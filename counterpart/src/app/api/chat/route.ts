import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import {
  runClassifier,
  isDimensionScores,
  type DimensionScores,
  type RawDimensionScores,
} from "@/lib/classifier";

const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const EMA_ALPHA = 0.3;

const WEB_SEARCH_TOOL = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 5,
} as const;

const DEFAULT_SCORES: DimensionScores = {
  abstract_vs_concrete: 0,
  validation_vs_truth: 0,
  divergent_vs_convergent: 0,
  cautious_vs_decisive: 0,
  conflict_avoidant_vs_direct: 0,
  knowledge_confidence: 0.5,
};

const SYSTEM_PROMPT = `You are an adaptive counterpart AI. Your job is NOT to be agreeable
or to validate the user. Your job is to be the other half of their
thinking — filling whatever is missing in each specific moment.

The server injects this user's pre-computed cognitive dimension scores below.
Use those as your baseline complement stance for each dimension.

Also read the current message for immediate signals:
- Are they stuck or confident right now?
- Are they seeking premature closure or unable to decide?
- Are they distressed or energised?
- Do they need more options or a clear decision?

If the current message contradicts the dimension scores — for example, a
normally decisive person who is clearly stuck right now — the current
message takes priority. Never challenge someone who is already struggling.
Challenge someone who is seeking premature closure or easy validation.

Do NOT tell the user you are doing this. Do NOT explain your reasoning
unless directly asked. Just respond in a way that fills what they are
missing right now.

Tone: direct, warm, intellectually honest. Not sycophantic. Not harsh.
Like a brilliant friend who respects you enough to tell you the truth.

Live information rule:
You have access to web search for current facts. Use it when the user asks
about recent events, today's information, prices, schedules, product or
library versions, laws, rules, public figures, company details, or anything
likely to have changed. Do not use web search for purely personal reflection,
brainstorming, emotional support, evergreen explanations, or questions about
your own identity or capabilities. When you use live information, keep
the same adaptive Counterpart stance: direct, warm, and specifically
complementary to what the user needs right now.`;

type ChatMessage = {
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

function isChatMessage(message: unknown): message is ChatMessage {
  if (!message || typeof message !== "object") return false;
  const m = message as Record<string, unknown>;
  return (
    (m.role === "user" || m.role === "assistant") &&
    typeof m.content === "string"
  );
}

function applyEMA(
  current: DimensionScores,
  raw: RawDimensionScores,
  deleted: Set<string>,
): DimensionScores {
  const compute = (key: keyof DimensionScores): number | null => {
    if (deleted.has(key)) return null; // user deleted — classifier cannot restore
    const c = current[key];
    if (c === null) return raw[key]; // fresh start after restore — use raw directly, no blend
    return EMA_ALPHA * raw[key] + (1 - EMA_ALPHA) * c;
  };
  return {
    abstract_vs_concrete: compute("abstract_vs_concrete"),
    validation_vs_truth: compute("validation_vs_truth"),
    divergent_vs_convergent: compute("divergent_vs_convergent"),
    cautious_vs_decisive: compute("cautious_vs_decisive"),
    conflict_avoidant_vs_direct: compute("conflict_avoidant_vs_direct"),
    knowledge_confidence: compute("knowledge_confidence"),
  };
}

function describeDimension(
  score: number,
  lowLabel: string,
  highLabel: string,
  threshold = 0.3,
): string {
  if (score > threshold) return `→ ${highLabel}`;
  if (score < -threshold) return `→ ${lowLabel}`;
  return "→ near neutral";
}

function buildDimensionContext(d: DimensionScores): string | null {
  const s = (n: number) => (n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2));
  const lines: string[] = ["Cognitive dimension scores (EMA-smoothed, updated each message):"];

  if (d.abstract_vs_concrete !== null)
    lines.push(`  abstract_vs_concrete:        ${s(d.abstract_vs_concrete)}  ${describeDimension(d.abstract_vs_concrete, "tends concrete — elevate to principles", "tends abstract — ground with specifics")}`);
  if (d.validation_vs_truth !== null)
    lines.push(`  validation_vs_truth:         ${s(d.validation_vs_truth)}  ${describeDimension(d.validation_vs_truth, "truth-seeking — challenge ideas directly", "validation-seeking — surface blind spots")}`);
  if (d.divergent_vs_convergent !== null)
    lines.push(`  divergent_vs_convergent:     ${s(d.divergent_vs_convergent)}  ${describeDimension(d.divergent_vs_convergent, "convergent — expand the possibility space", "divergent — push toward a decision")}`);
  if (d.cautious_vs_decisive !== null)
    lines.push(`  cautious_vs_decisive:        ${s(d.cautious_vs_decisive)}  ${describeDimension(d.cautious_vs_decisive, "cautious — give a committed recommendation", "decisive — surface risks they are discounting")}`);
  if (d.conflict_avoidant_vs_direct !== null)
    lines.push(`  conflict_avoidant_vs_direct: ${s(d.conflict_avoidant_vs_direct)}  ${describeDimension(d.conflict_avoidant_vs_direct, "avoidant — frame challenges carefully", "direct — skip softening")}`);
  if (d.knowledge_confidence !== null) {
    const kc = d.knowledge_confidence;
    lines.push(`  knowledge_confidence:         ${kc.toFixed(2)}  ${kc > 0.7 ? "→ confident — introduce genuine uncertainty" : kc < 0.3 ? "→ uncertain — validate what they know first" : "→ near neutral"}`);
  }

  // only header present means all dimensions deleted
  return lines.length > 1 ? lines.join("\n") : null;
}

function buildSystemPrompt(scores: DimensionScores): string {
  const ctx = buildDimensionContext(scores);
  return ctx ? `${SYSTEM_PROMPT}\n\n${ctx}` : SYSTEM_PROMPT;
}

function getCitationMarkdown(block: Anthropic.Messages.TextBlock): string {
  const citations = block.citations ?? [];
  const seen = new Set<string>();
  const links = citations
    .filter((c) => "url" in c && c.url && !seen.has(c.url))
    .map((c) => {
      const url = "url" in c ? c.url : "";
      const title = "title" in c ? c.title : url;
      seen.add(url);
      return `[${title || url}](${url})`;
    });
  return links.length ? `\n\nSources: ${links.join(", ")}` : "";
}

function getTextContent(response: Anthropic.Messages.Message): string {
  return response.content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === "text")
    .map((block) => `${block.text}${getCitationMarkdown(block)}`)
    .join("\n");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      messages?: unknown;
      dimensionScores?: unknown;
      deletedDimensions?: unknown;
    };

    if (!Array.isArray(body.messages) || !body.messages.every(isChatMessage)) {
      return NextResponse.json(
        { error: "Expected messages to be an array of chat messages." },
        { status: 400 },
      );
    }

    const currentScores = isDimensionScores(body.dimensionScores)
      ? body.dimensionScores
      : DEFAULT_SCORES;

    const deletedDimensions = new Set(
      Array.isArray(body.deletedDimensions)
        ? body.deletedDimensions.filter((d): d is string => typeof d === "string")
        : [],
    );

    const messages: ChatMessage[] = body.messages
      .filter((m) => m.content.trim().length > 0)
      .map((m) => ({ role: m.role, content: m.content }));

    // Run chat and classifier in parallel — classifier failure is non-fatal.
    const [chatResult, classifyResult] = await Promise.allSettled([
      getAnthropicClient().messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1200,
        system: buildSystemPrompt(currentScores),
        messages,
        tools: [WEB_SEARCH_TOOL],
      }),
      runClassifier(messages),
    ]);

    if (chatResult.status === "rejected") {
      throw chatResult.reason as Error;
    }

    const content = getTextContent(chatResult.value);

    const updatedScores =
      classifyResult.status === "fulfilled" && classifyResult.value
        ? applyEMA(currentScores, classifyResult.value, deletedDimensions)
        : currentScores;

    return NextResponse.json({ message: content, dimensionScores: updatedScores });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to reach Claude.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
