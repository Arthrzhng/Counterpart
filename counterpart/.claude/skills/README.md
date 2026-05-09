# Counterpart Skills

Eight skill files for Claude Code, derived from the project docs in `/docs/`.

These exist so you don't have to re-explain the project to Claude every session, and so the rules from your docs (privacy posture, MVP scope, schema fidelity, voice) get enforced without you having to remember them every time.

## What's here

| Skill | When to use |
|---|---|
| `product-brain` | Anchor. Load at the start of every session. Used for any planning, scoping, or decision. |
| `engineering-rules` | Any backend/database/API/job code. Schemas, logging contract, summarization loop. |
| `promptsmith` | Designing or iterating any prompt. Golden sets, regression testing, registry. |
| `execution-coach` | Daily planning, scope decisions, "what should I build next?". Forcing questions to prevent Phase 2 drift. |
| `privacy-guard` | Any change touching user data, settings, deletion, third parties. Non-negotiable rules. |
| `founder-voice` | Drafting any user-facing or audience-facing copy — landing, posts, threads, essays, in-product. |
| `cost-monitor` | Any code that calls the Anthropic API or paid services. Model selection, caching, budget guards. |
| `demo-producer` | Designing the 30-second comparison clips. Highest-ROI marketing artifact. |

## How the skills find the docs

Each skill references files in `/docs/` by relative path. When Claude Code runs in your repo, it can read those files directly. The skills are calibrated against the May 2026 versions of those docs — re-derive them if you do a significant docs update.

## Skill triggering

Claude Code reads the `description` field in each skill's frontmatter and decides whether to invoke based on the user's request. If a skill is triggering too often or not enough, edit its `description`. Keep the body the same — the description is the routing logic.

See the top-level `README.md` of this bundle for installation and usage details.
