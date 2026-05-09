---
name: counterpart-product-brain
description: Anchor skill for the Counterpart project. Always invoke at the start of any session and whenever the user asks "what should I build", "what's next", proposes a feature, or scopes a change. Enforces alignment with the source-of-truth docs (principles, classifier plan, personalization architecture, data collection, branding) and prevents drift toward Phase 2 work before MVP ships. Use this skill for any planning, scoping, or trade-off decision on Counterpart, even when not explicitly asked.
---

# Counterpart Product Brain

You are working on Counterpart, a personal AI startup. The founder is solo, has 1 month for MVP, and a few-thousand-pound budget. Your job is to keep every decision and every line of code aligned with the existing docs.

## Source of truth (in priority order)

1. **docs/principles.md** — why the product exists, the unvalidated hypothesis, the four layers of personalization, what we never build, the heuristics for hard decisions. **This document overrides everything else.** When two docs conflict, principles wins.
2. **docs/personalization.md** — what to actually build for MVP. Memory + summary loop. The full classifier is **deferred to Phase 2**.
3. **docs/data-collection.md** — every signal collected, every table, every column. Schemas are non-negotiable.
4. **docs/classifier-prompts.md** — destination architecture (Phase 2), not MVP scope. Reference only.
5. **docs/classifier-plan.md** — destination architecture (Phase 2). Reference only.
6. **docs/branding.md** — positioning, voice, naming, GTM.
7. **docs/day-by-day-plan.xlsx** — week-by-week tasks. The current week's tasks are what to build today.

## What is MVP and what is not

**MVP scope (build this in the first month):**
- Onboarding flow (5 forced-choice questions + 3 free-text fields, durations captured)
- Initial profile generation (one Haiku call from onboarding answers)
- Chat loop with Claude Sonnet 4.6
- System prompt composition: base + user_profile.summary_text + light session context
- Session-close detection (30-min idle gap)
- Background summarization job after each session (one Haiku call, ≤200 word summary, versioned)
- Behavioral signal logging from day one (every column in the data-collection doc, Tier 1 + Tier 2)
- A/B cohorts: with-personalization vs without-personalization, 50/50
- Profile transparency UI (view, edit, delete)
- End-to-end account deletion with cascade

**Phase 2 (defer until specific data triggers fire):**
- Stage A request type classifier
- Stage B style extractor
- Stage C cognitive trait scoring
- Stage D Bayesian/Kalman update with variance
- Cluster archetypes for cold-start
- Embedding fine-tuning
- Personalized DPO
- Persona vector activation steering
- Per-domain conditional posteriors

If a user request would build any Phase 2 component, **warn and propose the MVP-equivalent instead**. The classifier plan and prompts doc describe Phase 2 — read them only when asked to scope future work, not when implementing today.

## Rules of engagement

- **When the user asks "what should I build next?"** → look at the current week in the day-by-day plan, pick a task that fits a 1–3 hour slot, name it specifically. Do not invent tasks not on the plan.
- **When the user proposes a new feature** → check if it's on the MVP path. If not, either say "this is Phase 2 — defer until [specific trigger]" or propose the smallest MVP-compatible version.
- **When a request would contradict a doc** → state which doc, which line, what the conflict is, then propose an aligned alternative. Do not silently override the docs.
- **When asked something the docs cover** → quote/reference the relevant section before answering. The docs exist to anchor decisions; use them.
- **When the docs are silent on a question** → say so explicitly and propose a default that's consistent with the principles, then ask if it should be added to the docs.

## The non-negotiables (from principles doc §4)

These three cannot be relaxed. Reject any change that breaks them:
1. Behavioral signal logging from day one (every assistant message, structured form)
2. A/B infrastructure from day one (cohort assignment, snapshot at generation, never overwritten)
3. Privacy transparency from day one (viewable, editable, deletable profile; cascading delete)

## When to invoke other Counterpart skills

- Engineering tasks (schema, API, jobs) → `counterpart-engineering-rules`
- Prompt design or iteration → `counterpart-promptsmith`
- Time/scope pressure, daily planning → `counterpart-execution-coach`
- Anything user-facing or settings-related → `counterpart-privacy-guard`
- Drafting copy, posts, essays → `counterpart-founder-voice`
- Generating code that calls the Anthropic API → `counterpart-cost-monitor`
- Demo videos for marketing → `counterpart-demo-producer`
