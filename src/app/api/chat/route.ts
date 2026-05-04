import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const CLAUDE_MODEL =
  process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const PROFILE_PATTERN = /<profile>\s*[\s\S]*?\s*<\/profile>/;
const WEB_SEARCH_TOOL = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 5,
} as const;

const SYSTEM_PROMPT = `You are an adaptive counterpart AI. Your job is NOT to be agreeable 
or to validate the user. Your job is to be the other half of their 
thinking — filling whatever is missing in each specific moment.

As the conversation progresses, build a two-layer model of the user:

Layer 1 — Who they are generally (stable across the whole conversation):
Infer from all messages so far:
- Big-picture thinker or detail-oriented?
- Validation-seeking or challenge-seeking?
- Convergent (narrows quickly) or divergent (generates many ideas)?
- Analytical or intuitive?
- Cautious or overconfident?

Layer 2 — What they need right now (this specific message):
Read the current message for immediate signals:
- Are they stuck or confident right now?
- Are they seeking premature closure or unable to decide?
- Are they distressed or energised?
- Do they need more options or a clear decision?

Apply complement logic using BOTH layers:
- Big-picture thinker → ground them with concrete steps and specific risks.
- Seeks validation → surface a genuine counter-argument or blind spot.
- Convergent → expand the possibility space before they narrow.
- Divergent → evaluate and filter rather than generate more options.
- Overconfident → introduce doubt and missing considerations.
- Overcautious → give a committed recommendation.

If Layer 2 contradicts Layer 1 — for example, a normally overconfident 
person who is clearly anxious or stuck right now — Layer 2 takes 
priority. Never challenge someone who is already struggling. Challenge 
someone who is seeking premature closure or easy validation.

Do NOT tell the user you are doing this. Do NOT explain your reasoning 
unless directly asked. Just respond in a way that fills what they are 
missing right now.

Tone: direct, warm, intellectually honest. Not sycophantic. Not harsh. 
Like a brilliant friend who respects you enough to tell you the truth.

After every 3 user messages, append this block at the very end 
of your response with no extra text around it:
<profile>
{
  "trait1": {"label": "2-4 word cognitive pattern label", "description": "one sentence explaining what this reveals about how they think"},
  "trait2": {"label": "2-4 word cognitive pattern label", "description": "one sentence explaining what this reveals about how they think"},
  "trait3": {"label": "2-4 word cognitive pattern label", "description": "one sentence explaining what this reveals about how they think"}
}
</profile>

Labels must describe cognitive patterns, not communication style or 
personality traits.
Good label examples: Divergent under pressure, Closure-averse, 
Validation-seeking, Overconfident in abstractions, Intuition-first 
reasoner, Detail-avoidant, Premature converger.
Bad label examples: curious, friendly, brief, question-asker, 
open-minded.

Profile language rule:
The server will provide the detected primary language for profile values. 
Write only the profile trait label and description values in that server-
detected language. Keep all JSON keys exactly as shown in English: trait1, 
trait2, trait3, label, and description.

Live information rule:
You have access to web search for current facts. Use it when the user asks 
about recent events, today's information, prices, schedules, product or 
library versions, laws, rules, public figures, company details, or anything 
likely to have changed. Do not use web search for purely personal reflection, 
brainstorming, emotional support, or evergreen explanations unless the user 
explicitly asks for current information. When you use live information, keep 
the same adaptive Counterpart stance: direct, warm, and specifically 
complementary to what the user needs right now.`;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ProfileTrait = {
  label: string;
  description: string;
};

type CurrentProfile = {
  trait1: ProfileTrait;
  trait2: ProfileTrait;
  trait3: ProfileTrait;
};

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string;
};

type LanguageScore = {
  name: string;
  score: number;
};

const LATIN_LANGUAGE_MARKERS: Record<string, string[]> = {
  English: [
    "a",
    "and",
    "are",
    "be",
    "but",
    "for",
    "have",
    "help",
    "i",
    "in",
    "is",
    "it",
    "me",
    "my",
    "need",
    "not",
    "of",
    "that",
    "the",
    "this",
    "to",
    "want",
    "with",
    "you",
  ],
  Spanish: [
    "ayuda",
    "ayudes",
    "cerrar",
    "como",
    "con",
    "decision",
    "decidir",
    "direccion",
    "el",
    "elegir",
    "en",
    "es",
    "la",
    "las",
    "lo",
    "me",
    "muchas",
    "necesito",
    "no",
    "opciones",
    "para",
    "que",
    "quiero",
    "tengo",
    "una",
  ],
  French: [
    "avec",
    "ce",
    "dans",
    "de",
    "des",
    "du",
    "est",
    "et",
    "je",
    "la",
    "le",
    "les",
    "mais",
    "me",
    "mon",
    "nous",
    "pas",
    "pour",
    "que",
    "qui",
    "un",
    "une",
    "vous",
  ],
  Portuguese: [
    "a",
    "as",
    "com",
    "de",
    "do",
    "e",
    "eu",
    "isso",
    "mais",
    "mas",
    "me",
    "nao",
    "o",
    "os",
    "para",
    "preciso",
    "que",
    "uma",
    "voce",
  ],
  German: [
    "aber",
    "auf",
    "das",
    "der",
    "die",
    "ein",
    "eine",
    "ich",
    "im",
    "ist",
    "mit",
    "nicht",
    "und",
    "was",
    "zu",
  ],
  Italian: [
    "che",
    "con",
    "di",
    "e",
    "ho",
    "il",
    "io",
    "la",
    "le",
    "ma",
    "mi",
    "non",
    "per",
    "un",
    "una",
  ],
};

let anthropic: Anthropic | null = null;

function getAnthropicClient() {
  if (!anthropic) {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new Error("Missing ANTHROPIC_API_KEY.");
    }

    anthropic = new Anthropic({ apiKey });
  }

  return anthropic;
}

function isChatMessage(message: unknown): message is ChatMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  const candidate = message as Record<string, unknown>;
  return (
    (candidate.role === "user" || candidate.role === "assistant") &&
    typeof candidate.content === "string"
  );
}

function isProfileTrait(value: unknown): value is ProfileTrait {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.label === "string" &&
    typeof candidate.description === "string"
  );
}

function isCurrentProfile(value: unknown): value is CurrentProfile {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    isProfileTrait(candidate.trait1) &&
    isProfileTrait(candidate.trait2) &&
    isProfileTrait(candidate.trait3)
  );
}

function countRegexMatches(content: string, pattern: RegExp) {
  return content.match(pattern)?.length ?? 0;
}

function detectScriptLanguage(content: string) {
  const scriptScores: LanguageScore[] = [
    { name: "Arabic", score: countRegexMatches(content, /[\u0600-\u06ff]/g) },
    { name: "Hebrew", score: countRegexMatches(content, /[\u0590-\u05ff]/g) },
    { name: "Chinese", score: countRegexMatches(content, /[\u4e00-\u9fff]/g) },
    { name: "Japanese", score: countRegexMatches(content, /[\u3040-\u30ff]/g) },
    { name: "Korean", score: countRegexMatches(content, /[\uac00-\ud7af]/g) },
    { name: "Russian", score: countRegexMatches(content, /[\u0400-\u04ff]/g) },
    { name: "Greek", score: countRegexMatches(content, /[\u0370-\u03ff]/g) },
    { name: "Hindi", score: countRegexMatches(content, /[\u0900-\u097f]/g) },
    { name: "Thai", score: countRegexMatches(content, /[\u0e00-\u0e7f]/g) },
  ].sort((a, b) => b.score - a.score);

  return scriptScores[0]?.score > 0 ? scriptScores[0].name : null;
}

function detectLatinLanguage(content: string) {
  const normalized = content
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const words = normalized.match(/[a-z]+/g) ?? [];
  const wordSet = new Set(words);

  const scores = Object.entries(LATIN_LANGUAGE_MARKERS)
    .map(([name, markers]) => ({
      name,
      score: markers.filter((marker) => wordSet.has(marker)).length,
    }))
    .sort((a, b) => b.score - a.score);

  return scores[0]?.score ? scores[0].name : "English";
}

function detectMessageLanguage(content: string) {
  return detectScriptLanguage(content) ?? detectLatinLanguage(content);
}

function detectPrimaryLanguage(messages: AnthropicMessage[]) {
  const languageCounts = new Map<string, number>();
  const firstSeen = new Map<string, number>();

  messages
    .filter((message) => message.role === "user")
    .forEach((message, index) => {
      const language = detectMessageLanguage(message.content);
      languageCounts.set(language, (languageCounts.get(language) ?? 0) + 1);

      if (!firstSeen.has(language)) {
        firstSeen.set(language, index);
      }
    });

  if (!languageCounts.size) {
    return "English";
  }

  return [...languageCounts.entries()]
    .sort(([languageA, countA], [languageB, countB]) => {
      if (countA !== countB) {
        return countB - countA;
      }

      return (firstSeen.get(languageA) ?? 0) - (firstSeen.get(languageB) ?? 0);
    })[0][0];
}

function getLanguageWritingRule(language: string) {
  switch (language) {
    case "Arabic":
      return "Use Arabic script for every profile label and description value.";
    case "Hebrew":
      return "Use Hebrew script for every profile label and description value.";
    case "Chinese":
      return "Use Chinese characters for every profile label and description value.";
    case "Japanese":
      return "Use Japanese writing for every profile label and description value.";
    case "Korean":
      return "Use Korean Hangul for every profile label and description value.";
    case "Russian":
      return "Use Russian Cyrillic for every profile label and description value.";
    case "Greek":
      return "Use Greek for every profile label and description value.";
    case "Hindi":
      return "Use Devanagari Hindi for every profile label and description value.";
    case "Thai":
      return "Use Thai script for every profile label and description value.";
    default:
      return `Use natural ${language} for every profile label and description value.`;
  }
}

function buildSystemPrompt(
  currentProfile: CurrentProfile | null,
  userMessageCount: number,
  detectedPrimaryLanguage: string,
) {
  const hasProfile =
    currentProfile &&
    currentProfile.trait1.label.trim().length > 0 &&
    currentProfile.trait2.label.trim().length > 0 &&
    currentProfile.trait3.label.trim().length > 0;

  const cadenceInstruction =
    userMessageCount > 0 && userMessageCount % 3 === 0
      ? `FINAL OUTPUT REQUIREMENT FOR THIS RESPONSE: This request contains ${userMessageCount} user messages. Because that count is divisible by 3, you MUST append the <profile> JSON block at the very end of this response. The profile label and description values must follow the profile language rule above. Do not omit the <profile> block.`
      : `This request contains ${userMessageCount} user messages. Because that count is not divisible by 3, do not append a <profile> block in this response.`;
  const languageInstruction = `Server-detected primary language for profile label and description values: ${detectedPrimaryLanguage}. You MUST write profile label and description values in ${detectedPrimaryLanguage}. ${getLanguageWritingRule(detectedPrimaryLanguage)} Do not use Arabic or any other language unless the server-detected language is that language. If the existing currentProfile is written in a different language, translate/update the next profile values into ${detectedPrimaryLanguage}. Never use placeholder labels like "Insufficient data"; infer the best three cognitive patterns from the conversation.`;

  if (!hasProfile) {
    return `${SYSTEM_PROMPT}

${languageInstruction}

No profile established yet. Infer from this conversation and apply complement logic based on what you observe so far.

${cadenceInstruction}`;
  }

  return `${SYSTEM_PROMPT}

Current inferred cognitive profile for this user:
- ${currentProfile.trait1.label}: ${currentProfile.trait1.description}
- ${currentProfile.trait2.label}: ${currentProfile.trait2.description}
- ${currentProfile.trait3.label}: ${currentProfile.trait3.description}

${languageInstruction}

Your response MUST directly apply complement logic based on this specific profile. This is the most important instruction. Do not ignore it. Do not be generic. Be specifically complementary to this exact person.

${cadenceInstruction}`;
}

function shouldAppendProfile(userMessageCount: number) {
  return userMessageCount > 0 && userMessageCount % 3 === 0;
}

function getCitationMarkdown(block: Anthropic.Messages.TextBlock) {
  const citations = block.citations ?? [];
  const seen = new Set<string>();
  const links = citations
    .filter((citation) => "url" in citation && citation.url && !seen.has(citation.url))
    .map((citation) => {
      const url = "url" in citation ? citation.url : "";
      const title = "title" in citation ? citation.title : url;
      seen.add(url);
      return `[${title || url}](${url})`;
    });

  return links.length ? `\n\nSources: ${links.join(", ")}` : "";
}

function getTextContent(response: Anthropic.Messages.Message) {
  return response.content
    .filter(
      (block): block is Anthropic.Messages.TextBlock => block.type === "text",
    )
    .map((block) => `${block.text}${getCitationMarkdown(block)}`)
    .join("\n");
}

function buildProfileRepairPrompt(
  userMessageCount: number,
  detectedPrimaryLanguage: string,
) {
  return `You generate only the Counterpart cognitive profile block.

The conversation has ${userMessageCount} user messages, so a profile update is required.

Infer the user's cognitive patterns from all user messages.

Server-detected primary language for profile label and description values: ${detectedPrimaryLanguage}. You MUST write profile label and description values in ${detectedPrimaryLanguage}. Do not use Arabic or any other language unless the server-detected language is that language.
${getLanguageWritingRule(detectedPrimaryLanguage)} Never use placeholder labels like "Insufficient data"; infer the best three cognitive patterns from the conversation.

Return only this exact block shape and nothing else:
<profile>
{
  "trait1": {"label": "2-4 word cognitive pattern label", "description": "one sentence explaining what this reveals about how they think"},
  "trait2": {"label": "2-4 word cognitive pattern label", "description": "one sentence explaining what this reveals about how they think"},
  "trait3": {"label": "2-4 word cognitive pattern label", "description": "one sentence explaining what this reveals about how they think"}
}
</profile>

Keep all JSON keys in English.`;
}

function coerceProfileBlock(content: string) {
  const match = content.match(PROFILE_PATTERN);

  if (match) {
    return match[0];
  }

  const trimmed = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return `<profile>\n${trimmed}\n</profile>`;
  }

  return null;
}

async function createProfileRepairBlock(
  messages: AnthropicMessage[],
  userMessageCount: number,
  detectedPrimaryLanguage: string,
) {
  const response = await getAnthropicClient().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 500,
    system: buildProfileRepairPrompt(userMessageCount, detectedPrimaryLanguage),
    messages,
  });
  const content = getTextContent(response);
  return coerceProfileBlock(content);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      messages?: unknown;
      currentProfile?: unknown;
    };

    if (!Array.isArray(body.messages) || !body.messages.every(isChatMessage)) {
      return NextResponse.json(
        { error: "Expected messages to be an array of chat messages." },
        { status: 400 },
      );
    }

    const currentProfile = isCurrentProfile(body.currentProfile)
      ? body.currentProfile
      : null;

    const messages: AnthropicMessage[] = body.messages
      .filter((message) => message.content.trim().length > 0)
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));
    const userMessageCount = messages.filter(
      (message) => message.role === "user",
    ).length;
    const detectedPrimaryLanguage = detectPrimaryLanguage(messages);

    const response = await getAnthropicClient().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1200,
      system: buildSystemPrompt(
        currentProfile,
        userMessageCount,
        detectedPrimaryLanguage,
      ),
      messages,
      tools: [WEB_SEARCH_TOOL],
    });

    let content = getTextContent(response);

    if (shouldAppendProfile(userMessageCount) && !PROFILE_PATTERN.test(content)) {
      const profileBlock = await createProfileRepairBlock(
        messages,
        userMessageCount,
        detectedPrimaryLanguage,
      );

      if (profileBlock) {
        content = `${content.trim()}\n\n${profileBlock}`;
      }
    }

    return NextResponse.json({ message: content });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to reach Claude.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
