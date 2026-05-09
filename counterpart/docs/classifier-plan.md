**Counterpart**

Classifier System: Implementation Plan

*Working document — May 2026*

# 0. How to use this document

This is a working implementation plan for the Counterpart classifier system. It is structured so you can follow it linearly to build the MVP, then return to expand each layer over time. The document has four parts:

- Foundations — what the classifier is for, success criteria, what 'right' looks like.

- MVP architecture — the minimum system you can ship in 4–6 weeks.

- Implementation playbook — week-by-week build order, file structure, data schema.

- Long-term roadmap — what to add at 500, 5K, 10K, and 50K users.

Throughout, anything in italics is a decision to revisit later, and anything marked CRITICAL is a constraint that should not be relaxed without explicit reasoning.

# 1. Foundations

## 1.1 What the classifier is actually for

The classifier exists to make every response from Counterpart better than a generic AI's response would have been for this specific user. That is the only success criterion that matters. It is not to accurately predict Big Five personality scores, not to assign users to cognitive style buckets, and not to produce psychologically valid trait estimates.

The classifier produces three things the response system uses:

- Request type — what kind of help does the user want right now? (information, task, creative, thinking support)

- User model — who is this user, what do they know, how do they communicate, how do they think?

- Response steering — given the request type and user model, how should the response be shaped?

Everything in the architecture serves one of those three outputs. If a component does not feed into one of them, it does not belong in the system.

## 1.2 What '**better' looks like

Better is operationalized as four behavioral signals, in priority order:

- The user re-engages with the response (asks follow-up, builds on it, doesn't regenerate).

- The user returns to the product within 7 days.

- The user reports the response was useful (thumbs up or equivalent explicit signal).

- Over time, the user shows compounding value — sessions get more substantive, not less.

CRITICAL: success is not measured by the classifier accurately predicting trait scores against any external label. The classifier is good if its outputs cause better responses; it is not good in any other sense. Treat this as a hard rule when designing evaluation.

## 1.3 The four layers of personalization

The classifier needs to capture all four layers. Earlier in development you may have thought of cognitive style as the only target — it is one of four:

| **Layer** | **What it captures** | **Example** |
| --- | --- | --- |
| Baseline competence | The frontier model handles this. Not a personalization layer — table stakes. | Correctly explains a maths problem. |
| Surface | Basic facts, context, current projects. | Knows the user is preparing for SATs. |
| Style | How the user prefers to receive information. | Uses worked examples not first-principles. |
| Cognitive | How the user thinks, decides, and gets stuck. | Notices the user tends to commit early without checking alternatives. |

*CRITICAL: cognitive personalization is additive, not substitutive. A maths explanation should be correct, calibrated to the user's level, in the user's preferred style, and (where useful) noticing the user's typical patterns. The earlier framing of 'complement is the whole product' was wrong. Complement is the deepest layer of personalization, not a separate product mode.*

## 1.4 What we are explicitly not trying to do

- Predict Big Five or any other psychometric construct accurately. The literature shows this is near-impossible from text (r ≤ 0.27 on validated interview data), and the product does not need it.

- Produce a static user profile. The user's state changes by message, by session, and over months. The system models a moving target.

- Replace the frontier model. We use Claude / GPT-5 / equivalent for baseline competence and let our layer add personalization on top.

- Lead with anti-sycophancy as the user-facing pitch. The mechanism is real and useful, but the framing is 'AI that knows you', not 'AI that won't flatter you'. The classifier supports the former.

# 2. MVP architecture (target: 4–6 weeks to ship)

## 2.1 The pipeline at a glance

Each user message goes through the following pipeline. Total target latency: under 4 seconds end-to-end.

[user message]

    ↓

Stage A: Request Type Classifier (Haiku)

    ↓

Stage B: Style/Content Extractor (Haiku, parallel with A)

    ↓

Stage C: User Model Lookup (Mem0 + Supabase)

    ↓

Stage D: Trait Update (Bayesian, only on cognitive-relevant messages)

    ↓

Stage E: Response Steering (prompt composition)

    ↓

Stage F: Response Generation (Claude Sonnet/Opus)

    ↓

[response] + [behavioral signal logging]

## 2.2 Stage A — Request Type Classifier

A short Claude Haiku call that tags the message with one of these categories:

- **information** — user wants a fact, an answer, an explanation. Personalize to their level and style; do not push back unless they're factually wrong.

- **task** — user wants help producing something (code, writing, analysis). Personalize to their style; complement only if their approach is structurally weak.

- **creative** — user wants brainstorming, exploration, generation. Personalize to their style; offer divergent options.

- **decision** — user is working through a choice or problem. Highest-value mode for the complement engine; pushback and gap-filling earn their keep here.

- **venting** — user is processing emotion. Acknowledge; do not score cognitive traits from these messages; do not push back.

- **meta** — user is asking about the AI itself, the conversation, or the system. Direct response, no scoring.

- **small_talk** — pleasantries. Light response, no scoring.

*CRITICAL: only the decision and (sometimes) task categories should trigger trait updates. The earlier failure mode of 'I'm sad' affecting validation_vs_truth scores comes from running the rubric on every message regardless of type. Stage A is the structural fix.*

## 2.3 Stage B — Style/Content Extractor

A second small Haiku call (parallel with Stage A to save latency) that extracts:

- Hedging level (how much uncertainty the user signals — 'might', 'maybe', 'I think')

- Directness markers (how blunt or roundabout)

- Technical register (level of jargon, formality)

- Detail preference signals (does the user ask short questions or explain extensively)

These feed into a separate communication_style profile, NOT into the cognitive trait scores. The earlier failure mode (hedging being conflated with conflict_avoidance) is fixed by routing style features to a style axis and only scoring cognitive traits on substantive content.

## 2.4 Stage C — User Model Lookup

Retrieve from storage:

- The user's current cognitive trait posteriors (means + variances)

- Their communication style profile

- Their topic expertise estimates (what domains they know vs are learning)

- The k=5 most relevant past messages by embedding similarity

- The current session context (last 20 turns)

Storage stack: Mem0 for memory hierarchy + Supabase pgvector for embeddings + Supabase Postgres for trait posteriors and metadata. All accessed in parallel.

## 2.5 Stage D — Trait Update (Bayesian)

If Stage A tagged the message as decision-type or substantive task-type, score the message against the cognitive rubric and update the posterior using a Kalman filter.

For each cognitive dimension d:

posterior_mean_t = posterior_mean_{t-1} + K * (observation - posterior_mean_{t-1})

K (Kalman gain) = P_prior / (P_prior + observation_noise)

P_posterior = (1 - K) * P_prior + process_noise

observation_noise is context-dependent: short messages get high noise (downweighted), high-confidence classifier outputs get low noise (upweighted), off-topic messages get effectively infinite noise (skipped).

*CRITICAL: the posterior variance is a first-class output. The response steering layer uses it to know how confident to be in the user model. High variance on a dimension means 'don't lean on this trait yet' rather than guessing.*

## 2.6 Stage E — Response Steering

Compose the system prompt for the response model based on:

- Request type (from Stage A) — determines the high-level mode (informational, decision support, etc.)

- Communication style profile — adapts tone, length, format

- Topic expertise — calibrates depth, jargon, assumed background

- Cognitive trait posteriors (only for decision/task modes, only on dimensions with low variance) — informs whether to push back, what to surface, what gaps to flag

The complement mechanism activates here. For decision mode, with confident trait posteriors, the prompt includes lines like 'this user tends to commit to first ideas — surface alternatives'. For information mode the same trait is dormant; the user just wants their question answered.

## 2.7 Stage F — Response Generation

Standard Claude Sonnet or Opus call with the composed system prompt and conversation context. No special handling beyond the prompt.

## 2.8 Behavioral signal logging (continuous)

After every response, log:

- Did the user respond? How quickly? How long was their response?

- Did they regenerate the AI's response? How many times?

- Did they copy any text from the response?

- Did they explicitly thumbs up/down?

- Time-to-next-message in this session

- Session length and depth

- D1, D7, D30 return signals

*CRITICAL: these signals are the eventual training data for personalized DPO. Even though the MVP doesn't train on them, they must be logged in structured form from day one. Reconstructing them later is impossible.*

# 3. Implementation playbook

## 3.1 File structure

counterpart/

├── apps/

│   ├── web/                    # Next.js frontend

│   └── api/                    # API routes / edge functions

├── packages/

│   ├── classifier/

│   │   ├── stage_a_request_type.ts

│   │   ├── stage_b_style.ts

│   │   ├── stage_c_user_model.ts

│   │   ├── stage_d_trait_update.ts

│   │   ├── stage_e_steering.ts

│   │   └── pipeline.ts         # orchestrator

│   ├── memory/

│   │   ├── mem0_client.ts

│   │   ├── embeddings.ts

│   │   └── retrieval.ts

│   ├── bayesian/

│   │   ├── kalman.ts           # update equations

│   │   ├── observation_noise.ts

│   │   └── priors.ts

│   ├── logging/

│   │   ├── behavioral_signals.ts

│   │   └── preference_pairs.ts

│   └── prompts/

│       ├── stage_a_prompt.ts

│       ├── stage_b_prompt.ts

│       ├── steering_templates.ts

│       └── rubrics.ts

├── supabase/

│   ├── migrations/

│   └── functions/

└── tests/

    ├── golden_messages.ts      # hand-labeled eval set

    └── pipeline_e2e.ts

## 3.2 Data schema (Supabase)

### users table

| **Column** | **Type** | **Notes** |
| --- | --- | --- |
| id | uuid | primary key |
| created_at | timestamptz |  |
| last_active_at | timestamptz |  |
| onboarding_completed | boolean | default false |
| ab_cohort | text | mirror │ complement │ neutral │ learned |

### user_profiles table

| **Column** | **Type** | **Notes** |
| --- | --- | --- |
| user_id | uuid | fk to users |
| embedding | vector(1536) | current profile embedding |
| embedding_n_messages | int | how many messages contributed |
| communication_style | jsonb | hedging, directness, register, detail |
| topic_expertise | jsonb | {topic: estimated_level, last_seen} |
| updated_at | timestamptz |  |

### trait_posteriors table

| **Column** | **Type** | **Notes** |
| --- | --- | --- |
| user_id | uuid | fk to users |
| dimension | text | e.g. abstract_concrete, decisive_cautious |
| mean | float | posterior mean, [-1, 1] |
| variance | float | posterior variance |
| n_observations | int | messages that updated this dim |
| updated_at | timestamptz |  |

### messages table

| **Column** | **Type** | **Notes** |
| --- | --- | --- |
| id | uuid |  |
| user_id | uuid | fk |
| session_id | uuid |  |
| role | text | user │ assistant |
| content | text |  |
| embedding | vector(1536) |  |
| request_type | text | from Stage A; null for assistant msgs |
| scored_dimensions | jsonb | Stage D outputs if scored |
| response_variant | text | for A/B; mirror│complement│neutral│learned |
| created_at | timestamptz |  |

### behavioral_signals table

| **Column** | **Type** | **Notes** |
| --- | --- | --- |
| id | uuid |  |
| user_id | uuid | fk |
| assistant_message_id | uuid | the response being signaled about |
| signal_type | text | regenerate, copy, thumbs_up, thumbs_down, follow_up, time_to_next |
| signal_value | jsonb | type-dependent payload |
| created_at | timestamptz |  |

## 3.3 The cognitive rubric (working set)

Six dimensions to start. These are scored per qualifying message and updated via Kalman. Treat them as latent state variables, not psychological constructs.

| **Dimension** | **Low pole** | **High pole** |
| --- | --- | --- |
| abstract_concrete | abstract / theoretical | concrete / specific |
| divergent_convergent | exploratory / many options | focused / closes down |
| decisive_cautious | commits early | deliberates |
| systematic_intuitive | step-by-step / explicit | pattern-matching / implicit |
| validation_vs_truth | wants confirmation | wants accuracy |
| challenge_tolerance | low — bristles at pushback | high — invites pushback |

*CRITICAL: these are not psychological labels for the user. They are control variables for the response steering layer. Do not surface raw scores to users without translation; do not market the product around these dimensions; do not over-trust them.*

## 3.4 Build order (week-by-week)

### Week 1 — Foundations

- Set up monorepo, Supabase project, Mem0 account, Anthropic API key

- Migrate the database schema above

- Build the message logging pipeline end-to-end with no classification (just store messages and basic metadata)

- Verify a basic chat loop works against Claude Sonnet

- Set up behavioral signal logging skeleton (even if no UI for thumbs up yet, log what you can: regenerations, time-to-next-message)

### Week 2 — Stage A ****&**** B

- Write the Stage A prompt; iterate against ~50 hand-curated example messages until tagging is reliable

- Write the Stage B prompt; same process

- Wire both stages in parallel into the pipeline

- Add unit tests using golden_messages.ts — 20-30 messages with hand-labeled expected tags

- Measure latency; if Stage A+B exceeds 1s combined, tighten prompts or move to Haiku

### Week 3 — Stage C ****&**** D

- Implement embedding generation (OpenAI text-embedding-3-large or Voyage voyage-3)

- Build retrieval over user's past messages (k-NN in pgvector)

- Implement the Kalman filter for trait dimensions (this is roughly 100 lines of TypeScript)

- Implement context-dependent observation noise: short message → high noise, high-confidence Stage C output → low noise

- Bootstrap priors: μ₀ = 0 (neutral), σ₀² = 1 (high uncertainty) for each dimension

### Week 4 — Stage E ****&**** F + integration

- Build the steering prompt template — start simple, just inject communication style and (when available) trait posteriors with low variance

- Wire the full pipeline together

- Add the A/B cohort assignment logic — randomly assign each new user to mirror, complement, neutral, or learned (initially: only run complement and neutral; mirror and learned arrive later)

- End-to-end test with 5 internal users for 100+ messages each

### Week 5 — Calibration and golden-set evaluation

- Hand-label 100-200 messages with rubric scores (you + ideally one other rater)

- Measure agreement between rater and Stage C output

- Fit isotonic regression to calibrate raw scores → calibrated probabilities

- Compute baseline metrics: average posterior variance per dimension after 5 messages, after 20 messages

- Identify systematic failure modes; write specific test cases for them

### Week 6 — Soft launch and iteration

- Open access to first 50 users

- Daily review of behavioral signals — which response variants get re-engagement?

- Daily review of failure cases — where is the classifier wrong, where is steering producing weird outputs?

- Iterate prompts and steering templates based on what you see

## 3.5 Prompt patterns (starting points)

### Stage A prompt skeleton

You are classifying the type of help the user is asking for.

Categories:

- information: factual question, explanation, definition

- task: produce something concrete (code, writing, analysis)

- creative: brainstorm, generate options, explore

- decision: working through a choice or problem

- venting: processing emotion, not asking for action

- meta: asking about the AI or the conversation

- small_talk: pleasantries, no real ask

Return JSON: { tag: <category>, confidence: 0.0-1.0 }

User message: <message>

### Stage E steering template skeleton

Base instruction: <standard system prompt>

User context:

- Communication style: <hedging level, register, detail preference>

- Domain expertise relevant here: <topic: level>

// For decision-type requests with confident trait posteriors:

Notes about how this user thinks:

- <only insert dimensions where variance < threshold>

- e.g. 'tends to commit to first ideas — surface alternatives'

- e.g. 'thinks abstractly — ground with one concrete example'

// For other request types: omit the cognitive notes block.

## 3.6 Evaluation strategy

Three layers of evaluation, all running continuously:

- Unit-level: golden-set tests on Stage A and Stage B tagging accuracy. Run on every commit.

- System-level: a synthetic conversation harness that simulates 50 user types and checks whether trait posteriors converge to plausible values after 20 messages. Run weekly.

- Production: behavioral signals from real users. Run continuously; weekly review meeting.

*CRITICAL: do not optimize the classifier against rubric accuracy alone. The ground truth is behavioral — does the user's session get better when steering is active? Set up the A/B test to make this measurable from the first week of real users.*

# 4. Long-term roadmap

## 4.1 At ~500 users

- Run k-means / GMM clustering on user embeddings to discover natural cognitive archetypes

- Implement cluster-archetype priors for cold-start (Tier 2 of the three-tier scheme)

- Begin A/B test analysis — is complement actually winning vs neutral on retention metrics?

- Add the 'learned' arm to the A/B (per-user attribute weights tuned by lightweight DPO over decoding-time prompts)

- Hand-label expansion to 500 messages; refit calibration

## 4.2 At ~5K users

- Begin contrastive fine-tuning of the embedding model on collected user data (same-user-as-positive objective)

- Add active elicitation (GATE-style) — when posterior variance on a high-leverage dimension is high, the response generator is told to surface the question diagnostically

- Add expanded request types (e.g. split task into code, writing, analysis sub-types)

- Begin per-dimension specialist judges (prompt-only at first) for trait scoring — replaces monolithic Stage C

- Production calibration audits monthly; reliability diagrams per dimension

## 4.3 At ~10K users with feedback

- Train first personalized DPO model on logged preference triples

- Move from prompt-level Drift to actual fine-tuning (open-source frontier model: Llama-3.3-70B or Qwen-3 family)

- Switch fine-tuned per-dimension experts in for prompt-only specialists

- Add hierarchical Bayesian pooling — share information across users for σ_w² and σ_v² estimation

- Federated personalization layer for GDPR-sensitive deployments

## 4.4 At 50K+ users (long-term moat phase)

- Implement actual persona vector activation steering (when on an open frontier model)

- Multi-vector representation: stable cognitive traits + current knowledge state + values, all separate

- Situational personality steering — context-aware modulation of complement strength

- The Counterpart Vector becomes a portable user representation that can configure any frontier model

# 5. Decisions to make before starting

Resolve these before week 1 — they are choices, not technical constraints, and changing them later is expensive.

- Embedding model: OpenAI text-embedding-3-large vs Voyage voyage-3 vs Cohere embed-v4. Default recommendation: voyage-3 (strongest in benchmarks for retrieval + cheaper than OpenAI at scale).

- Frontier model for response generation: Claude Sonnet 4.6 vs Opus 4.7 vs GPT-5. Default: Sonnet 4.6 for cost; Opus 4.7 for hard decision-type requests.

- Frontier model for classifier stages: Haiku 4.5 (fast, cheap) is the only realistic choice for Stage A and Stage B latency.

- A/B cohort sizing: 25/25/25/25 across mirror/complement/neutral/learned, or weighted toward complement (your hypothesis) like 40/40/10/10? Default: even split — you want clean comparisons, not validation theater.

- How aggressive to be with cognitive trait scores in the steering prompt early on. Default: only inject a trait into the steering prompt when its posterior variance is below 0.3. Tune from there.

- Process noise (σ_w²) per dimension: large for traits expected to drift (e.g. challenge_tolerance changes with mood), small for stable traits. Default: 0.05 for stable, 0.15 for variable. Tune from logged data.

- Whether to expose any of this to the user. Default: no for MVP. Add a 'what Counterpart understands about you' panel only after the model is reliable enough that users won't be embarrassed by what it shows.

# 6. Risks and how to manage them

## 6.1 The classifier overfits to small early data

With 50 users you'll see patterns that look real but are noise. Mitigation: do not deploy any major change based on fewer than 100 users' worth of behavioral data. Resist the urge to over-tune prompts to specific cases.

## 6.2 Steering produces robotic-feeling responses

Heavy-handed prompt injection ('this user is high-decisive — push back') can make Claude's responses feel templated. Mitigation: keep the steering subtle in the system prompt. Frame as gentle context ('this user thinks in concrete examples') not directives ('make sure to provide concrete examples').

## 6.3 The complement mechanism annoys users

Pushing back on every decision-type message will exhaust users. Mitigation: only activate complement when (a) the user's posterior on a relevant trait is confident, (b) the user appears engaged in genuine deliberation rather than asking for quick input, and (c) the pushback is forward-looking ('here's what would help') not backward-looking ('here's what's wrong').

## 6.4 Cold-start is bad enough that users churn before personalization kicks in

If the first 5 messages feel generic, users leave. Mitigation: a lightweight onboarding that gathers explicit preferences (style, expertise areas, what they're working on) — gives the system a head start without requiring 20 organic messages.

## 6.5 Privacy

The system stores extensive behavioral and inferred-cognitive data per user. Mitigation: encrypt at rest, expose a profile-view-and-delete UI from day one, never share inferred traits with third parties, treat the data as the most sensitive class of user data the company holds. GDPR right-to-erasure must work end-to-end including Mem0 stores.

# 7. Definition of done for the MVP

The MVP classifier is shippable when all of these are true:

- Pipeline runs end-to-end in under 4 seconds for a typical message

- Stage A request-type tagging agrees with hand-labeled gold set on at least 85% of messages

- Stage B style extraction produces stable values that match a user's actual style on inspection

- Trait posteriors converge to plausible values after 20 messages on internal test users

- Steering produces responses that feel meaningfully different across A/B cohorts on identical input

- Behavioral signals are logged in structured form for every assistant message

- Profile data can be viewed and deleted end-to-end

- System has been used by at least 10 internal/early-access users for 100+ messages each without major bugs

*End of working document.*

*Revisit decisions in §5 and risks in §6 monthly during build phase.*