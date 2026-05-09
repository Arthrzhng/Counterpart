---
name: counterpart-cost-monitor
description: Use this skill whenever generating code that calls the Anthropic API, embeddings APIs, or any paid third-party service. Also use when reviewing code for cost-related smells, designing the LLM call architecture, choosing models, or estimating monthly spend. The founder has a few-thousand-pound budget total — runaway API costs are a real risk. Always invoke when writing handlers that call Sonnet/Opus/Haiku, when implementing the summarization loop, when adding retries, or when the user mentions cost, billing, or budget.
---

# Counterpart Cost Monitor

The total budget is a few thousand pounds. Anthropic API will be the largest line item. One bad loop can burn the runway in 24 hours. Be paranoid about cost.

## Model selection rules

Use the cheapest model that does the job. Defaults:

| Use case | Model | Why |
|---|---|---|
| Initial profile generation (from onboarding) | **Haiku 4.5** | Single short call, simple synthesis |
| Session summarization (background job) | **Haiku 4.5** | Run once per session, ≤200 word output |
| Stage A request type classifier (Phase 2) | **Haiku 4.5** | Categorical, latency-sensitive |
| Stage B style extractor (Phase 2) | **Haiku 4.5** | Feature extraction, latency-sensitive |
| Stage E steering composition (Phase 2, when complex) | **Sonnet 4.6** | Composing instructions affects every response |
| Response generation (default) | **Sonnet 4.6** | The user-facing output |
| Response generation (decision-tagged) | **Opus 4.7** | Reasoning-heavy, only when Stage A tagged decision |
| Embeddings | **Voyage voyage-3** | Cheaper than OpenAI at scale, strong retrieval performance |

If the user proposes Opus 4.7 anywhere except decision-type response generation, push back. Opus is roughly 5× the cost of Sonnet — only use it where the quality difference is needed.

If the user proposes Sonnet anywhere a Haiku call would work (small classifiers, summarization, simple extraction), push back.

## Cost smells to flag in generated code

When reviewing or generating code, these are the patterns that burn money. Flag them before merging.

### Loop / retry smells

- **Infinite retry loops.** Always set max retries (default 2) and a backoff. A 503 from Anthropic should not retry 200 times.
- **Recursive LLM calls.** If the response from one call triggers another LLM call without a depth limit, depth must be capped (typically ≤3).
- **Polling loops that call the model.** If you're polling something LLM-related, poll the cheap thing (database, queue) not the model.

### Caching smells

- **Re-injecting unchanged context every message.** The `user_profile.summary_text` doesn't change within a session. Use **Anthropic's prompt caching** for the system prompt block — caches expire after 5 minutes by default but can be configured for longer. This can drop input token cost by 90% on repeated calls.
- **Re-computing embeddings for unchanged content.** Embed once, store in pgvector, retrieve. Never re-embed on every read.
- **Recomputing the summary every message.** The summarization runs **on session close**, not on every turn. If you see code that calls the summarizer in the request path, stop it.

### Model-choice smells

- **Sonnet/Opus where Haiku would do.** Most classifier and extraction tasks fit Haiku. The cost delta is ~12× from Haiku to Sonnet.
- **Opus everywhere "for quality."** Opus is for decision-type responses only. Default to Sonnet.
- **High max_tokens for structured outputs.** A JSON classifier output is ~50 tokens. Don't set `max_tokens: 4000` and hope for the best — set it tight.

### Streaming smells

- **Not streaming user-facing responses.** Streaming improves perceived latency at no cost difference. Always stream Sonnet/Opus responses to the user.
- **Streaming background jobs.** Don't stream the summarization call — there's no user watching.

### Token waste smells

- **Including the entire conversation history every call.** Use a sliding window (last 10–20 turns) plus the summary. The summary is the long-term memory; the window is the short-term.
- **Verbose system prompts.** Per principles, keep steering prompts under ~200 words. Long prompts make the response model overweight them and cost more on every call.
- **Pasting whole files into context when only a function is needed.** Extract before sending.

## Cost estimation (rough numbers, May 2026)

Use these to sanity-check projected monthly spend. Always quote a range, not a point estimate.

Per active user with ~50 messages/month, ~30s avg session:

- Stage A + B classifier (Haiku, Phase 2): ~£0.05/month
- Summarization (Haiku, 1× per session, ~10 sessions): ~£0.10/month
- Response generation (Sonnet, ~50 messages, ~1500 input tokens with prompt cache, ~500 output): ~£1.50/month
- Embeddings (Voyage): ~£0.05/month
- **Total: ~£1.70 per active user per month**

For 1,000 active users → ~£1,700/month. For 100 active users → ~£170/month. Use this as the floor estimate; real cost is usually 1.5–2× because power users skew the average.

When the user proposes a feature, do a rough back-of-envelope:
- How many model calls does this add per active user per month?
- Which model?
- What's the monthly added cost at 100 users? At 1,000?

If the answer is "I don't know" — work it out before building.

## Required cost controls

These should exist before public launch.

### Per-user rate limits

- Free tier: cap messages/day at a number that bounds worst-case cost (start: 50/day)
- Premium tier: higher cap, monitor for abuse
- Hard cap on tokens-per-message (no 100K-token pastes)
- Lockout on >N regenerations of the same message in M minutes (regenerate is cheap, but a stuck user can regenerate 1000 times)

### Per-account spend ceiling

- Implement a daily and monthly per-user spend cap
- When approaching the cap, downgrade transparently (e.g., switch to Haiku for the rest of the day, with a notice)
- Never silently fail — tell the user what's happening

### Anthropic-side controls

- Set a hard monthly spend cap in the Anthropic Console
- Configure billing alerts at 25%, 50%, 75%, 100% of monthly budget
- Use API keys scoped per environment (dev/staging/production)
- Rotate keys and never commit them

### Prompt caching

For the system prompt structure on every response call:
- The base instruction + user_profile.summary_text + recent context can be cached
- Add `cache_control: { type: "ephemeral" }` to the cacheable blocks
- Document which parts of the system prompt are cacheable in the engineering docs

## When generating code that calls the API, include:

1. **Model selection** — explicit, justified by use case
2. **Max tokens** — tight, not "just in case" generous
3. **Temperature** — explicit, not relying on default
4. **Retry policy** — max 2 retries, exponential backoff, fail loudly after
5. **Timeout** — explicit (30s for response generation, 60s for summarization)
6. **Prompt caching** — if the input has stable parts >1024 tokens
7. **Logging** — input tokens, output tokens, model used, cost in cents (compute from tokens)
8. **Error handling** — what happens when the API fails (don't loop, don't crash, return a graceful fallback)

## When the user proposes new model usage

Respond with:

1. **What model and why** — justify the choice
2. **Per-user cost estimate** — at 100, 1000 users
3. **Cheaper alternative** — what would Haiku cost? Is the quality delta worth it?
4. **Caching strategy** — is any of this prompt cacheable?
5. **What gets killed if cost spikes** — what's the fallback (smaller model, rate limit, queue)

## Hard rejections

- "Let's call Opus on every message for highest quality" → No. Sonnet default, Opus only for decision-tagged.
- "Let's run the classifier on every message in real time" → For MVP, skip the classifier entirely. For Phase 2, classifier runs but uses Haiku.
- "Let's embed every message synchronously" → No. Embeddings are async.
- "Let's run the summarizer after every turn" → No. Session close only.
- "Let's not bother with prompt caching for now" → No. It's the easiest 50%+ cost cut available.
