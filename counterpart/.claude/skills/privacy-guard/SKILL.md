---
name: counterpart-privacy-guard
description: Use this skill whenever a change touches user data, settings, onboarding, profile UI, account deletion, logging, third-party integrations, or anything user-trust-adjacent. Enforces the privacy posture from docs/principles.md §4.3 and docs/data-collection.md §10. Privacy is a brand feature, not a footnote — these rules cannot be relaxed without explicit founder decision and a corresponding doc update. Always invoke when designing settings UI, onboarding flow, data collection changes, or anything that affects what users can see, edit, or delete.
---

# Counterpart Privacy Guard

Privacy is a brand feature, not a compliance checkbox. The product's pitch is "AI that knows you deeply" — that promise only works if users trust the company with the data. Every privacy decision is also a brand decision.

## The five non-negotiables

These cannot be relaxed without an explicit founder decision logged in the principles doc. If a change would violate any of them, **reject the change and propose an alternative**.

### 1. Profile data is viewable, editable, deletable — always

Every piece of inferred data about a user (the `user_profile.summary_text`, `communication_style`, `topic_expertise`, `domains_used`) must be:
- Visible from a "My Data" panel in settings
- Translated to plain language (no raw embeddings, no internal field names like "validation_vs_truth")
- Editable (the user can correct what the system has gotten wrong)
- Deletable (per-field, per-session, or all-data)

If a feature stores something the user can't see, **flag it**. The exception is logging that's purely for debugging (error stacks, request IDs) — those don't need to be visible but must still be deletable.

### 2. Account deletion is end-to-end and cascading

When a user deletes their account, every byte must go:
- All rows in `users`, `sessions`, `messages`, `response_pairs`, `onboarding_responses`, `user_profiles`, `events`, `behavioral_signals`
- All embeddings (in pgvector and any future Mem0 store)
- Any cached data (Redis, edge cache, KV store)
- Any backups within the legal retention window — flagged for deletion at next backup rotation

This must work end-to-end before launch. **Test it before any user signs up.** A privacy promise that doesn't actually delete data is worse than no promise.

When generating a migration that adds a new user-data table, include the `ON DELETE CASCADE` foreign key in the same migration. Do not add the cascade later.

### 3. No third-party data sharing, ever

- No analytics tools that send user data off-platform (no Segment, no Mixpanel, no Amplitude with user identifiers)
- No advertising networks
- No data brokers
- No "anonymous aggregate" sharing (re-identification is real)
- No fine-tuning on a user's data without their explicit, per-feature opt-in
- The only third party that sees user content is the LLM provider (Anthropic), and that's disclosed clearly

This rules out a lot of standard-tooling default behavior. When generating code, **never integrate** Sentry/PostHog/Hotjar/etc. with user identifiers attached. If error tracking is needed, scrub PII in the SDK.

### 4. Encryption at rest for sensitive columns

The data collection doc §10.3 specifies column-level encryption for:
- All message content (`messages.content`)
- Email addresses (`users.email`)
- Onboarding free text (`onboarding_responses.context_*`)
- Profile summary text (`user_profiles.summary_text`)

When generating migrations or schemas, apply Supabase's column-level encryption (pgsodium or equivalent) to these columns. Do not store them as plaintext.

### 5. The "never collect" list

Per data collection doc §10.4, never collect:
- Individual keystrokes (only aggregate timing — duration, edit count)
- Mouse position or movement
- Activity in other tabs (only that the tab lost focus, not what they switched to)
- Browser fingerprinting beyond the User-Agent
- Microphone or camera input
- Cross-site tracking pixels
- Geolocation beyond IP-derived country

If a feature request implies any of these, reject it. There is no version of these that's compatible with the brand.

## The "would the user be alarmed if disclosed" test

For any new signal proposed for collection:
1. Imagine showing it to the user in the My Data panel.
2. Would they be surprised? Alarmed? Creeped out?
3. If yes → don't collect it. Find a less-invasive proxy.
4. If no → fine to collect, and add it to the My Data view.

This test catches things compliance-as-checkbox doesn't. Browser fingerprinting is technically legal in many jurisdictions; it still fails this test.

## What the user sees in My Data (per data collection doc §10.1)

Show:
- The natural-language profile summary (current `user_profile.summary_text`)
- Conversation history with full search
- Onboarding answers, editable
- Aggregate stats (sessions, messages, days active)
- Devices used

Don't show:
- Raw embeddings
- Per-message metadata (token counts, sentiment scores)
- Internal classifier outputs
- Response pair metrics
- The trait dimension names (when Phase 2 ships)

The principle: surface insight, hide infrastructure.

## When the user asks for a new feature

Run this check:

1. Does it create new data? → Add to My Data view.
2. Does it change deletion semantics? → Update cascade in the migration.
3. Does it integrate a third party? → Verify against the "no third-party sharing" rule.
4. Could it surprise a user? → Run the "alarmed if disclosed" test.
5. Does it touch encrypted columns? → Confirm encryption is preserved end-to-end.

## Onboarding-specific rules

The onboarding flow collects sensitive context (what they do, what they're working on). For each free-text field:
- Tell the user upfront what it's for ("we use this to calibrate the AI's responses to your situation")
- Make it skippable
- Show it back to them before submitting ("here's what we'll remember about you — edit anything")

The five forced-choice questions are weak priors per personalization-revised doc §3.4. Tell the user this explicitly during onboarding: "These give us a starting point. We'll update them based on how you actually use the product."

## GDPR specifics (UK-based founder, UK/EU users assumed)

- Right of access: My Data panel covers this; also support a "download all my data" button that returns a JSON export
- Right of erasure: account deletion covers this; verify cascade
- Right of rectification: in-place editing of profile and onboarding answers
- Lawful basis: consent for inferred profile data, contract for service delivery
- Data Processing Agreement with Anthropic: the founder needs to ensure this exists; flag this if it hasn't been signed
- Privacy policy must be plain-language and specific, not a generic template

## When generating code, check before merging

- Does this query include `where user_id = ?` to enforce row-level access?
- Does this new table have RLS enabled with policies?
- Does this new column appear in the My Data view (if user-visible) or the deletion cascade (if server-only)?
- Does this third-party SDK send user-identifiable data anywhere?
- Does this background job have access only to data the user consented to?

## The marketing implication

Privacy posture is part of the brand. The branding doc §6.3 says to market it explicitly:
- "We can't see your conversations" (after content encryption)
- "Delete your account in one click and we mean it"
- "We never share your data with anyone"

When writing landing copy or onboarding copy, lean into this. Privacy isn't a footnote at the bottom of the page; it's one of the three proof points.
