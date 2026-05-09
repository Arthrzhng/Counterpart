---
name: counterpart-promptsmith
description: Use this skill whenever you design, modify, or test a prompt for Counterpart — the system prompt, the summarization prompt, onboarding profile generation, or any future Stage A/B/C/E prompts. Enforces the prompt iteration discipline from docs/classifier-prompts.md: golden sets, regression testing, JSON validation, prompt versioning, and Workbench-first iteration. Always invoke when the user asks to "tweak", "improve", "iterate on", or "test" a prompt.
---

# Counterpart Promptsmith

Prompts are the highest-leverage code in Counterpart. Treat them with more care than ordinary code: every prompt change can affect every user, and bad prompts ship silently.

## What prompts exist (MVP)

1. **Initial profile generation** — Haiku call from onboarding answers → first `user_profile.summary_text`
2. **Session summarization** — Haiku call after each session → updated profile (see `counterpart-engineering-rules` for the canonical text)
3. **System prompt composition** — base instruction + user_summary + light session context, injected into every Sonnet response call

What prompts exist (Phase 2, deferred): Stage A request type, Stage B style extraction, Stage C trait scoring, Stage E steering composition. Reference: `docs/classifier-prompts.md`. Do not implement these in MVP unless explicitly told to.

## Prompt registry (required from day 1)

Every prompt lives in a versioned registry, not inline in handler code:

```ts
// packages/prompts/registry.ts
export const SUMMARIZATION_PROMPT = {
  version: "1.0.0",
  system: `You maintain a running profile of a user...`,
  user: (currentSummary: string, transcript: string) =>
    `Existing profile:\n${currentSummary}\n\nNew session:\n${transcript}`,
};
```

When invoking the prompt, log the version on the resulting row:
```ts
logRun({
  prompt: 'summarization',
  prompt_version: SUMMARIZATION_PROMPT.version,
  user_id, session_id,
  // ...
});
```

This is what makes prompt regressions investigable later.

## The golden set (required for any prompt change)

Before merging a prompt change:

1. Write or load the golden set for that prompt: 10–20 hand-curated input/expected-output pairs in `tests/golden/{prompt_name}.json`
2. Run the new prompt against the golden set
3. Compare against expected outputs (exact match for tags, semantic match for free text)
4. **Do not merge a prompt change that drops accuracy below threshold without explicit reasoning logged in the PR.**

Golden set entries should include hard cases, not easy ones:
- Edge cases (one-word messages, code blocks, multilingual)
- Failure modes seen in production
- Cases that previously caused regressions

If a prompt has no golden set yet, **building one is the first task**, before iterating the prompt. 30 minutes of golden-set work saves days of debugging.

## Workbench-first, code second

Iterate prompts in **Anthropic Workbench**, not in TypeScript:
- Workbench preserves version history automatically
- It's faster to try variants
- It supports running against test sets without redeploying
- Once you find a prompt that works, paste the final version into the registry

Never iterate prompts by editing TypeScript and redeploying. That is slow and loses history.

## JSON output discipline

Every prompt that returns structured data:
- Return strict JSON only (no preamble, no markdown fences)
- Validate with Zod or equivalent on receive
- On parse failure: retry once with temperature 0; if still fails, log and use a default neutral output
- Never `JSON.parse(rawOutput)` without a try/catch

Example schema for Stage A (when implemented):
```ts
const StageASchema = z.object({
  tag: z.enum(['information', 'task', 'creative', 'decision', 'venting', 'meta', 'small_talk']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});
```

## Temperature settings

| Prompt | Temperature | Why |
|---|---|---|
| Stage A request type (Phase 2) | 0 | Categorical, want determinism |
| Stage B style features (Phase 2) | 0 | Feature extraction |
| Stage C trait scoring (Phase 2) | 0.2 | Slight noise improves calibration when aggregated |
| Initial profile generation | 0 | Deterministic, single output |
| Session summarization | 0.3 | Slight variation prevents over-locked phrasing |
| System prompt composition | 0 | Composing instructions |
| Response generation (Sonnet) | 0.7 | Default; the response is the user-facing output |

## Prompt smells to watch for

If you see any of these in production logs, the prompt needs work:
- Reasoning fields all look the same → prompt is too prescriptive about reasoning structure
- Confidence is always 0.95 or always 0.5 → prompt isn't giving the model permission to be uncertain
- All scores cluster at extremes (-0.9 / +0.9) → need calibration; prompt is encouraging strong claims
- Short messages get scored on dimensions they shouldn't → prompt isn't strong enough about null defaults
- Steering produces preachy or aggressive responses → too directive; soften to gentle context

## When the user asks for prompt help, respond as:

1. **What's the prompt for?** (Which stage / which task)
2. **What does the doc say it should do?** (Reference docs/classifier-prompts.md or docs/personalization.md)
3. **What's the current version doing wrong?** (If iterating)
4. **The new prompt** (full text, ready to paste into Workbench or registry)
5. **Golden set additions** (if the change is motivated by a failure case, add the failure case to the golden set)
6. **Version bump** (semver: patch for tweaks, minor for behavior changes, major for schema changes)

## Things never to do

- Edit a prompt in TypeScript without a corresponding golden set run
- Deploy a prompt change that hasn't been tested on at least 10 examples
- Use string concatenation to build prompts at runtime (use template functions in the registry)
- Generate prompts longer than ~200 words for steering (long prompts overweight the response)
- Include the trait dimension names verbatim in user-facing steering ("this user is high decisive_cautious") — translate to natural language
- Instruct the response model to "be honest" or "avoid sycophancy" — the complement mechanism lives in the architecture, not in directives
