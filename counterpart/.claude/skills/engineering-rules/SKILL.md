---
name: counterpart-engineering-rules
description: Use this skill for any engineering task on Counterpart — writing migrations, API handlers, background jobs, the summarization loop, the logging layer, or any backend code. Enforces the schemas from docs/data-collection.md exactly, treats logging as non-negotiable infrastructure, and applies the summarization rules from docs/personalization.md. Always invoke when the user asks for code that touches the database, the chat pipeline, the session lifecycle, or the user profile.
---

# Counterpart Engineering Rules

## Stack assumptions

- **Database:** Supabase Postgres with pgvector extension
- **Backend:** Node.js / TypeScript (API routes in Next.js or Edge Functions)
- **Frontend:** Next.js 14+, TypeScript, Tailwind, shadcn/ui
- **Auth:** Supabase Auth (magic link or Google SSO)
- **Memory layer:** Mem0 (deferred to Phase 2 if needed; MVP uses Postgres only)
- **Embeddings:** Voyage `voyage-3` (default per principles doc); fall back to OpenAI `text-embedding-3-large` only if cost dictates
- **LLM:** Anthropic API. See `counterpart-cost-monitor` for which model where.

## Schemas: do not invent, do not improvise

Every table and column lives in **docs/data-collection.md**. Before writing any migration:

1. Confirm the table you need exists in the doc.
2. Confirm the columns you need exist on it.
3. If something doesn't exist, **ask before adding it**. Do not silently extend the schema.

The MVP-required tables are: `users`, `sessions`, `messages`, `response_pairs`, `onboarding_responses`, `user_profiles`, `events`. Derived views: `user_aggregates`, `response_pair_metrics`. Build them in this order — Tier 1 first, then Tier 2 (per §12 of the data collection doc).

When generating a migration:
- Use UUIDs for primary keys (Supabase convention)
- Use `timestamptz` for all timestamps, not `timestamp`
- Use `jsonb` not `json`
- Add foreign keys with `ON DELETE CASCADE` where appropriate (but see privacy-guard for full delete semantics)
- Enable Row Level Security (RLS) on every user-data table from the start; write policies as part of the migration
- Index foreign keys, `created_at`, and any column used in derived views

## The logging contract (non-negotiable)

Every assistant message must result in:
1. A row in `messages` with all linguistic columns populated
2. A row in `response_pairs` with the generation context snapshot
3. Behavioral signal rows logged as the user reacts (regenerate, copy, thumbs, time-to-followup)

If a code change would skip any of this, **stop and flag it**. Logging is the substrate for Phase 2; losing data is irreversible.

The generation context snapshot in `response_pairs.user_state_snapshot` must include, at minimum:
- The full `user_profile.summary_text` injected
- The cohort assignment at this moment
- The model used
- The prompt version used

This snapshot is frozen and never overwritten. It is the training data for personalized DPO at 10K users.

## Summarization loop (the core MVP personalization mechanism)

After each session ends (30 minutes of inactivity), a background job runs:

1. Load the user's current `user_profile` (the one with `is_current = true`)
2. Load the transcript of the just-ended session
3. Call **Claude Haiku 4.5** with the summarization prompt below
4. Set the previous profile row to `is_current = false`
5. Insert a new profile row with `is_current = true`, incremented `version`, the new summary text, and `triggering_session_id` set

**The summarization prompt** (do not modify without updating the docs):

```
System: You maintain a running profile of a user based on their conversations
with an AI assistant. Your job is to update the profile with new information
from their latest session.

Rules:
- Keep the profile under 200 words.
- Only include information that would help an AI assistant respond better
  to this user.
- Only include information that reflects stable patterns, not one-off
  emotional states.
- Do not include sensitive personal details (medical, financial, relationship
  specifics) unless the user has explicitly asked them to be remembered.
- Update existing observations rather than appending — if the new session
  contradicts an old one, update the profile to reflect the more recent
  evidence.
- Note when something is uncertain ("may prefer X") rather than asserting
  things you've only seen once.

Existing profile:
{current_summary}

New session transcript:
{session_transcript}

Return: updated profile as natural language paragraph or short structured
notes. Same length or shorter than existing.

Only return the profile text. No preamble, no markdown formatting.
```

**Hard rules for the summarization job:**
- Run on session close, not on every message (cost — see `counterpart-cost-monitor`)
- Versioned, never destructive — old versions kept for analysis
- If the call fails, do not retry indefinitely (max 2 retries, then log and skip)
- The summary is what gets injected into the system prompt for the next session

## API handler conventions

Every API route handler should:
- Validate input with Zod (no exceptions)
- Use the typed Supabase client; no raw `any`
- Return structured errors with codes, not stack traces
- Log structured events (not console.log dumps) — these become behavioral signals
- Be idempotent where possible (especially message-write endpoints — duplicates happen)
- Include the user_id in every query; never trust the client to scope its own data

## Background jobs (per data-collection doc §9.2)

Jobs needed at MVP:
- `session_close` — every 5 min, closes sessions idle > 30 min
- `update_user_profile` — runs on session close, calls summarization
- `update_response_pair_outcomes_24h` — hourly
- `update_response_pair_outcomes_7d` — daily
- `update_response_pair_outcomes_30d` — daily
- `compute_user_aggregates` — nightly

For MVP, use Supabase Edge Functions on cron triggers. Do not introduce a separate job queue (Inngest, Trigger.dev, BullMQ) until volume forces it.

## When generating code, structure your response as:

1. **Restate the change** — what migration, what handler, what job, in plain English
2. **Reference the doc** — which table/column/section in docs/data-collection.md or docs/personalization.md
3. **The code** — minimal, typed, with error handling
4. **What it touches** — list of files changed, new env vars needed, migration order
5. **What's not done** — explicit list of follow-ups so nothing is silently skipped

## Things never to do

- Add a column that isn't in the data-collection doc without flagging it
- Skip behavioral signal logging "just for this one feature"
- Run the summarization on every message instead of on session close
- Hard-code the cohort assignment (must be set at signup, never changed)
- Overwrite a previous `user_profile` row instead of versioning
- Use `service_role` keys client-side
- Generate code that calls Anthropic without retry/timeout/error handling
