**Counterpart**

Personalization Architecture — MVP and Beyond

*Revised — May 2026*

*This document supersedes the earlier 'Classifier Plan'. The earlier version designed a full speech-act classifier and Bayesian trait-update system as the MVP. After deeper thinking, the MVP is much simpler — memory plus a running summary — because building sophisticated classifiers before having data about what predicts retention is building on sand. The full classifier system from the earlier document is now Phase 2, and the prompts document is reference for when we get there. The earlier classifier plan and prompts document are still valid as the destination architecture; this document tells you what to build first.*

# 1. The thesis

Counterpart is the personal AI that compounds. The longer you use it, the more it knows you, and the more useful it becomes. The mechanism that delivers this at MVP is much simpler than the original classifier design: explicit context from onboarding, a running summary that updates after each session, and rich behavioral logging underneath.

This is not a downgrade. It's a different bet about where the leverage is. The original plan put leverage in the classifier — sophisticated trait inference per message. The revised plan puts leverage in the data collection and the summary loop — accumulating what the system understands about each user over time, and using that as the substrate for everything else.

The full classifier from the earlier document is still the destination. It just isn't the starting point.

***The MVP commits to two things absolutely: (1) memory and summary that compound over time, (2) comprehensive behavioral data collection from day one. Everything else — Bayesian filters, speech-act classification, trait scoring — is Phase 2 work that data will inform.***

# 2. MVP architecture

## 2.1 The whole system in one diagram

[user message]

    ↓

[backend logging] — captures message, computes linguistic features

    ↓

[load user context]

    - user_profiles.summary_text (current version)

    - last 10-20 turns of conversation

    - cohort assignment

    ↓

[compose system prompt]

    base + user_summary + session_context

    ↓

[Claude Sonnet generates response]

    ↓

[response logged with full state snapshot]

    ↓

[reactions logged as they arrive]

    - thumbs up/down, regenerate, copy, time-to-followup

    ↓

[on session close (background)]

    summarization job updates user_profile

    ↓

[next session starts with updated profile]

There is no per-message trait classifier. There is no Bayesian filter. There is no rubric scoring. The personalization is delivered by the summary that gets richer each session, not by per-message inference.

## 2.2 The three pillars

### Pillar 1: Onboarding context

New users complete a short onboarding flow:

- Five forced-choice questions (described in detail in section 3 below)

- Three free-text fields: what do you do, what are you working on, anything else

This produces an initial user_profile.summary_text via a single Claude Haiku call. The summary is what gets injected into every system prompt for this user.

### Pillar 2: Compounding summary

After each session ends (30 minutes of inactivity), a background job:

- Loads the current user profile summary

- Loads the transcript of the just-ended session

- Calls Claude Haiku with the summarization prompt

- Stores the new version in user_profiles (sets old version is_current=false)

The summary is bounded at 200 words and only includes information that helps an AI assistant respond better. It compounds over time without inflating.

### Pillar 3: Behavioral logging

Every interaction generates rich logging — the comprehensive list in the data collection document. This is the substrate that lets you eventually build the full classifier from real evidence rather than from theory. At MVP this data is collected but not yet used to alter responses; it's the foundation for Phase 2.

# 3. Onboarding flow

## 3.1 The five forced-choice questions

Designed to differentiate users in ways that change response behaviour, without asking about traits everyone claims to have.

### Question 1 — Structure preference

"When you want to understand something new, do you prefer:"

- (A) starting with the conclusion and working backwards to understand why

- (B) building up from the basics until the conclusion becomes obvious

### Question 2 — Challenge posture

"When someone thinks your reasoning has a flaw, do you prefer they:"

- (A) point it out directly and explain why

- (B) ask you questions that help you find it yourself

### Question 3 — Depth vs speed

"When you ask a question, do you usually want:"

- (A) the complete picture even if it takes longer

- (B) the most important thing quickly, with the option to ask for more

### Question 4 — Working style

"When you're stuck on something hard, is your instinct:"

- (A) to think out loud and process with someone

- (B) to go quiet and work it out alone, then verify

### Question 5 — Uncertainty response

"When the honest answer is 'it depends' or 'we don't know', do you prefer:"

- (A) the AI gives you its best guess clearly flagged as uncertain

- (B) lays out the factors so you can judge for yourself

## 3.2 What gets stored

For each question, store:

- The choice (A or B)

- The duration in milliseconds (decision speed)

Both go into onboarding_responses. The duration is signal: fast = confident, slow = genuine deliberation between two appealing options.

## 3.3 What gets generated

A single Claude Haiku call converts the choices into the initial natural-language summary. Prompt:

System: You are creating an initial profile for a new user of an AI

assistant. Translate their explicit preferences into a brief paragraph

that will be injected into the assistant's system prompt to help it

respond appropriately to this user from their first conversation.

Keep it under 100 words. Frame as observations, not labels.

User indicated:

- Structure preference: {choice_1}

- Challenge posture: {choice_2}

- Depth vs speed: {choice_3}

- Working style: {choice_4}

- Uncertainty response: {choice_5}

Free-text context:

- What they do: {context_what_you_do}

- Current project: {context_current_project}

- Other: {context_other}

Return: a profile paragraph in natural language. No preamble, no

headers, no labels — just the paragraph.

This profile gets stored as user_profiles.summary_text version 1, and is updated by the summarization job after each subsequent session.

## 3.4 Important: low weight on the choices

The forced choices are weak priors, not fixed identity. They influence the initial system prompt but get overwritten by observed behaviour quickly. By session 5, the summary should reflect what the user actually does, which may diverge from what they said upfront.

Frame this to the user explicitly during onboarding: "These give us a starting point. We'll update them based on how you actually use the product, which is more accurate than anything you can tell us upfront."

# 4. The summarization loop

## 4.1 When it runs

After every session ends. A session ends when 30 minutes pass with no user activity.

A background job watches for session_close events and runs the summarization on each. If a user has multiple short sessions in a day, each gets its own summarization. If the cost becomes a problem, batch nightly.

## 4.2 The prompt

System: You maintain a running profile of a user based on their

conversations with an AI assistant. Your job is to update the profile

with new information from their latest session.

Rules:

- Keep the profile under 200 words.

- Only include information that would help an AI assistant respond

  better to this user.

- Only include information that reflects stable patterns, not one-off

  emotional states.

- Do not include sensitive personal details (medical, financial,

  relationship specifics) unless the user has explicitly asked them

  to be remembered.

- Update existing observations rather than appending — if the new

  session contradicts an old one, update the profile to reflect the

  more recent evidence.

- Note when something is uncertain ("may prefer X") rather than

  asserting things you've only seen once.

- Don't include things they said in passing that don't reflect

  stable patterns.

Existing profile:

{current_summary}

New session transcript:

{session_transcript}

Return: updated profile as a natural language paragraph or short

structured notes. Same length or shorter than existing.

Only return the profile text. No preamble, no markdown formatting.

## 4.3 Why this works

The natural-language summary is doing the work that a structured trait profile would do, but with several advantages:

- It's interpretable — the user can see and edit what the system understands about them

- It's flexible — can capture nuances that don't fit predefined dimensions

- It's grounded in actual conversations — no inference from a rubric, just what the AI actually saw

- It's resilient — single weird sessions don't permanently warp the profile

- It's cheap — one Haiku call per session, near-zero cost at MVP scale

## 4.4 What the summary should look like over time

### Session 1 (post-onboarding)

Sam is studying for A-levels and SAT, currently focused on maths and

physics. They prefer direct, blunt feedback over Socratic questioning,

want the bottom line first then explanation, and prefer to think alone

before verifying with an AI rather than thinking out loud. They are

comfortable with the AI giving its best guess on uncertain questions

rather than just laying out factors.

### Session 5

Sam is a UK A-level student preparing for SAT alongside, focused on

maths, physics, and economics. They engage deeply with explanations

and ask follow-ups that build on previous answers. They prefer worked

examples over first-principles derivations. Communication is casual

and direct. They do not hedge much. They have shown interest in AI

and the architecture of language models. They prefer concrete numbers

and worked examples to abstract framings. When they disagree they say

so directly rather than hedging.

### Session 20

Sam is a UK A-level student in Newbury, preparing for SAT alongside

Edexcel maths, OCR physics, and economics. They learn fastest from

worked examples but engage with theory once grounded. They tend to

ask 'why' and 'where does this break' questions, suggesting deep

rather than surface engagement. Communication is casual and direct,

minimal hedging. They have a parallel project building an AI product

called Counterpart that they discuss occasionally. They are confident

with maths but more uncertain in essay-writing tasks. They handle

direct pushback well; they push back on the AI when they disagree.

They typically work alone first then verify, and want their reasoning

checked rather than reasoned through with them.

This is what compounding personalization looks like. By session 20 the AI knows the user well enough to respond meaningfully differently than ChatGPT could, without having run any per-message classifier.

# 5. The system prompt at runtime

## 5.1 Composition

Every message gets a three-part system prompt:

[Base instruction]

You are an AI assistant that adapts to the user. Be helpful, accurate,

and direct. Match the user's communication style.

[User context]

About this user:

{user_profile.summary_text}

[Session context]

{light session-level info: "This is session N, the user has been

 using the product for X days."}

## 5.2 What changes per cohort

Two cohorts at MVP: with-personalization and without-personalization.

With-personalization: full three-part prompt as above.

Without-personalization: base instruction only. No user context, no session context. This is the control group — they get a competent but generic AI experience. They serve as the baseline for measuring whether the personalization is actually doing anything.

***The without-personalization cohort is essential. Without it, you cannot answer the question **'**is the personalization layer actually contributing to retention?**'** That question must be answerable from the data, and the only way to answer it is having a control.***

## 5.3 Cohort sizing

50/50 at MVP. Even split gives you the cleanest comparison. Once you've validated personalization works (say, 200+ users showing significant retention difference), you can shift toward 80/20 in favor of personalization, but maintain a 20% control indefinitely so you can always answer the question.

# 6. What the MVP architecture enables

## 6.1 The user experience

From the user's perspective, what they get:

- Onboarding: 2-3 minutes, gives the AI a real starting point

- Session 1: feels noticeably more calibrated than a generic AI from message one

- Session 5: AI clearly remembers what they were working on last time

- Session 20: hard to imagine going back to ChatGPT for the same use cases

- All along: visible profile, editable, deletable — they always know what's stored

## 6.2 What you can measure

From the data:

- Does the personalization cohort retain better than the control? (the core hypothesis)

- Does retention difference grow over time? (compounding claim)

- What user behaviours predict retention? (the empirical question that drives Phase 2)

- What response characteristics correlate with engagement? (informs prompt iteration)

- Are there natural user clusters? (informs cold-start architecture later)

## 6.3 What this leaves for Phase 2

The original classifier plan is not abandoned — it's deferred. Specifically what Phase 2 will eventually add:

- Speech-act classification (Stage A) — when behavioral data shows certain message types systematically need different handling

- Style extraction (Stage B) — when the summary alone doesn't capture style finely enough

- Cognitive trait scoring (Stage C) — when there's evidence specific traits predict outcomes

- Bayesian update with variance — when point-estimate summaries aren't enough

- Domain-conditional posteriors — when single-context profiles miss too much

- Personalized DPO — when 10K+ users with logged preference triples justify the training cost

Each of these gets built when the data shows it's needed. Not before.

# 7. Migration path: MVP to full architecture

## 7.1 The triggers

From the principles document, restated and refined:

| **Phase 2 component** | **Trigger** | **Evidence** |
| --- | --- | --- |
| Speech-act classifier | Certain message types need systematically different handling | Behavioural signals show divergent patterns by message type |
| Style extractor | Summary doesn't capture style precisely enough | Manual inspection of summaries shows misses; behavioral data shows style-correlated outcomes |
| Cognitive trait scoring | Specific traits empirically predict outcomes | Regression on behavioral signals shows trait-like patterns |
| Bayesian update with variance | Point estimates are wrong in ways that matter | Cold-start retention much worse than retained-user retention |
| Cluster archetypes | Natural groupings exist in user behaviour | K-means on user embeddings shows distinct clusters |
| Personalized DPO | Have 10K+ users with logged outcomes | Behavioural data has enough preference triples |

## 7.2 What's preserved

Critically, the MVP architecture is not thrown away when Phase 2 begins. The summary remains the high-level personalization layer. The classifier stages are added as a more granular layer that informs how the summary is used and updated.

Specifically:

- user_profiles table stays — summary is still the user-facing representation

- Behavioural logging stays exactly as designed

- Onboarding stays — it's still useful for the cold start

- New tables added: trait_posteriors, style_profile (if extracted separately), classifier_outputs

- New stages added before the system prompt composition: A, B, C, D as described in the original classifier plan

The original classifier plan is the destination. The MVP is a subset of it that ships first.

# 8. Build effort

MVP personalization layer in code is approximately:

| **Component** | **Estimated effort** |
| --- | --- |
| Onboarding UI + backend | 2-3 days |
| users + user_profiles tables and migrations | 0.5 days |
| Initial summary generation function | 0.5 days |
| System prompt composer | 1 day |
| Session close detection + summarization job | 1.5 days |
| A/B cohort assignment | 0.5 days |
| Profile transparency UI | 1.5 days |
| Total personalization layer | ~7-9 days |

This is roughly half what the original classifier plan estimated. The savings come from not building speech-act tagging, style extraction, trait scoring, Bayesian filters, or steering composition. All of that is real engineering work that the MVP now defers.

The behavioral logging layer (described fully in the data collection document) takes roughly 5-6 days on top of this. Total for MVP personalization + logging: about 2 weeks of focused engineering.

*End of revised personalization architecture document.*

*Read alongside the data collection document and the principles document.*