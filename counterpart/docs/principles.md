**Counterpart**

Product Principles & North Star

*The reasoning, philosophy, and constraints behind every decision in the other documents — May 2026*

*This is the document to read first when you've forgotten why a decision was made. It captures the founding philosophy, the unvalidated hypothesis at the heart of the product, the success metrics by stage, and the constraints that cannot be relaxed. The classifier plan and branding document tell you what to build and how to market it. This document tells you why.*

# 1. The product thesis

Counterpart is the personal AI that compounds. Generic AI assistants — ChatGPT, Claude, Gemini — give every user roughly the same response. They are optimized for broad acceptability across hundreds of millions of users, which makes them structurally incapable of deeply knowing any one user. Counterpart is the opposite: it learns how a specific person thinks, decides, and communicates, and adapts everything it does to them — the level of explanation, the style of response, the assumptions it makes, the gaps it surfaces. The longer you use it, the more useful it becomes.

The mechanism that makes this work is the cognitive complement: when the user is doing reasoning-heavy work — making decisions, working through problems, thinking out loud — the AI notices what's missing in their thinking and supplies it. Not by inverting them, not by being their opposite, but by filling the specific gaps their reasoning has. This is not the only thing the product does. For most requests — explaining a concept, helping with code, answering a question — Counterpart just does the task well, calibrated to who you are. The complement mechanism activates when it adds value, stays dormant when it doesn't.

The product is a daily driver, not a niche advisor. People use it for the same things they currently use ChatGPT for. The difference is that it actually knows them, and that compounds.

# 2. The founding philosophy

*Give users what they need, not just what they want. Personalization is the mechanism; genuine usefulness is the goal.*

## 2.1 What this means in practice

Most AI products optimize for engagement metrics. Engagement, in turn, optimizes toward agreement, validation, and flattery — because that's what feels good in the moment. Anthropic, OpenAI, and Stanford have all documented this: AI chatbots are roughly 50% more affirming than humans, including in cases where affirmation actively harms the user. Users prefer the sycophantic AI even when it makes them more self-righteous and less able to repair conflicts.

Counterpart's philosophy is to resist this. We optimize for whether the user is genuinely better off — better decisions, sharper thinking, real growth — even when that means saying things they didn't want to hear. The personalization layer is what makes this commercially viable: pushback from an AI that obviously knows you lands differently than pushback from a generic AI that doesn't.

## 2.2 The four layers of personalization

All four layers must work. They are additive, not substitutive.

| **Layer** | **What it captures** | **Example** |
| --- | --- | --- |
| Baseline competence | Frontier model handles this. Table stakes. | Correctly explains a maths problem. |
| Surface | Facts, context, current projects. | Knows the user is preparing for SATs. |
| Style | How the user receives information. | Worked examples vs first-principles. |
| Cognitive | How the user thinks, decides, gets stuck. | Notices the user commits early without checking alternatives. |

***If a request can be served well by baseline competence and surface personalization alone, do not activate the deeper layers. Forcing complement on every interaction makes the product exhausting. The cognitive layer earns its keep on decision-type and reasoning-heavy requests, not on factual questions or task help.***

# 3. The unvalidated hypothesis

***The single most important thing in this document. Read it whenever a decision feels obvious.***

Counterpart is built on an empirical hypothesis that is not yet proven: that AI which fills gaps in the user's reasoning produces better outcomes than AI which mirrors the user or behaves neutrally. No published research validates this. The personality-pairing literature in human-AI collaboration is mixed and task-dependent. The closest analog product (Inflection's Pi) collapsed in 2024.

This means three things:

- The complement mechanism is a hypothesis, not a finding. Build it, ship it, but treat it as a question being tested by the product, not a feature being delivered by it.

- The A/B infrastructure must run from day one. Mirror, complement, neutral, learned — all four arms instrumented from the first user. Without this, the question is unanswerable and the company is committed to an unverified bet.

- Do not build the brand around the complement claim as a certainty. The marketing leads with personalization (which is well-validated) and treats complement as one expression of it (which is still being tested). If the A/B test shows complement losing to mirror or learned, the brand survives because it was never the headline.

The right posture is: we believe the complement mechanism produces better long-term user outcomes, we have research-backed reasons to believe it, and we are betting the product on it being correct. We are not yet certain. The A/B test will tell us.

# 4. The three things you must not compromise on

These three constraints can break the product if relaxed. Everything else is iterable.

## 4.1 Behavioral signal logging from day one

Every assistant message must log: did the user re-engage, did they regenerate, did they copy text, did they thumbs up/down, time-to-next-message, session depth, D1/D7/D30 return signals. The structured form must be in place before the first user signs up. Reconstructing this later is impossible.

Why it matters: this is the training data for personalized DPO at the 10K user mark. It is also the only honest measure of whether the product is working. Without it, you are flying blind.

## 4.2 A/B infrastructure from day one

Mirror, complement, neutral, learned cohorts assigned at user creation. The response steering layer must support all four modes from the first deployment. Even if you only run two of them initially, the infrastructure must be there.

Why it matters: if the complement hypothesis is wrong, you need to know fast. If it's right, you need the data to prove it. The longer you wait to instrument this, the more committed you become to an unverified bet.

## 4.3 Privacy transparency from day one

Profile data viewable, editable, and deletable from settings. Delete account works end-to-end including Mem0 and embedding stores. No third-party data sharing, ever. GDPR compliance from the first UK/EU user.

Why it matters: deep personalization only works commercially if users trust you with the data. The moment a user feels watched or modeled in ways they didn't consent to, they leave faster than for any other reason. This isn't a legal requirement to satisfy — it's a brand feature to market.

# 5. Success metrics by stage

What numbers tell you the product is working at each scale. If these don't move in the right direction, change something.

## 5.1 MVP (0–500 users)

| **Metric** | **Target** | **Why this matters** |
| --- | --- | --- |
| D7 retention | ≥ 20% | Below this, the product isn't useful enough |
| Users with 50+ messages | ≥ 50 | Need volume per user for personalization to compound |
| Stage A tagging accuracy | ≥ 85% on golden set | Foundation of the whole pipeline |
| Behavioral signals logged | 100% of assistant messages | Non-negotiable infrastructure |
| A/B cohorts running | Yes, all four | Validates or kills the core hypothesis |

## 5.2 Early growth (500–5,000 users)

| **Metric** | **Target** | **Why this matters** |
| --- | --- | --- |
| D7 retention | ≥ 25% | Compounding personalization should improve this |
| D30 retention | ≥ 15% | First evidence of long-term value |
| Complement vs neutral A/B | Statistically significant winner | Validates or kills the hypothesis |
| Cold-start retention vs retained | Closing the gap with archetypes | Proves cluster priors work |
| Posterior variance after 20 messages | Below 0.3 on most dimensions | Classifier converging to useful state |

## 5.3 Scale (5K–10K users)

| **Metric** | **Target** | **Why this matters** |
| --- | --- | --- |
| D30 retention | ≥ 20% | Genuine product-market fit signal |
| Premium conversion | ≥ 5% of active users | Commercial validation |
| Embedding fine-tune lift | Beats off-the-shelf on behavioral prediction | Justifies architectural investment |
| Behavioral signals → preference triples | ≥ 50K usable triples | Enables personalized DPO training |

## 5.4 Maturity (10K+ users)

| **Metric** | **Target** | **Why this matters** |
| --- | --- | --- |
| DPO model A/B win rate | ≥ 60% vs prompt-level Drift | Justifies fine-tuning investment |
| Per-cohort retention divergence | Visible patterns in the data | Validates personalization at scale |
| Power user behavior | Daily-active multiple sessions | Compounding value is real |

# 6. When to upgrade the architecture

The classifier plan describes architectural upgrades at specific user-count milestones. Those are rough orders of magnitude, not targets. The actual triggers for each transition are data-driven.

## 6.1 Stage 1: Cluster archetypes for cold-start

- **Trigger: **cold-start retention is meaningfully worse than retained-user retention. Specifically, D7 retention for users in their first 5 messages is more than 10 points below D7 for users with 20+ messages.

- **What this signals: **the prior is bad. Users churn before personalization kicks in.

- **Cost: **low. SQL clustering query plus a weekly background job.

## 6.2 Stage 2: Embedding fine-tuning

- **Trigger: **off-the-shelf embeddings stop discriminating well between user types. Specifically, two users with visibly different cognitive styles produce embeddings that are too close together to separate them in archetype clustering.

- **What this signals: **general-purpose embeddings carry semantic signal but not enough cognitive-style signal.

- **Cost: **medium. Python training pipeline, GPU access, model versioning.

## 6.3 Stage 3: Personalized DPO

- **Trigger: **prompt-level steering plateaus. Adding more context to the steering prompt no longer improves response quality on the behavioral signal benchmark.

- **What this signals: **personalization needs to be baked into model weights, not just orchestrated at the prompt layer.

- **Cost: **high. Open-source frontier model in the loop, training infrastructure, parallel deployment with frontier-API fallback for hard requests.

## 6.4 Stage 4: Persona vector activation steering

- **Trigger: **you have a research/engineering capability that wants harder problems and the simpler architectures have run out of ceiling on their own metrics.

- **What this signals: **the moat is now architectural depth, not just data accumulation.

- **Cost: **very high. Self-hosted models, custom inference hooks, research-grade understanding of activation steering on your specific model.

***If a trigger doesn**'**t fire, the transition shouldn**'**t happen. Many products will end up with 1-2 of these layers, not all 4. The product can be commercially successful with just the MVP architecture indefinitely. The most common failure mode for early AI startups is over-engineering toward research-paper architectures before the simpler version is even validated.***

# 7. Heuristics for hard decisions

When facing a decision that the other documents don't directly address, return to these.

## 7.1 Engagement vs needs

If a feature would increase engagement but make users worse off (more rationalization, less critical thinking, more dependency), the answer is no. If a feature would decrease engagement but make users genuinely better off, the answer is probably yes — but track quality metrics alongside engagement to be sure.

This will create commercial pressure when engagement metrics look soft compared to a more sycophantic competitor. The philosophy is to honor the data on quality, not the data on engagement, when they conflict.

## 7.2 Build now vs build later

If the simpler version doesn't work, the more complex version probably won't either. Ship the MVP architecture and validate the core hypothesis before adding sophistication. Most architectural upgrades described in the long-term roadmap are optional — they exist for when the data demands them, not as a checklist.

## 7.3 What to personalize, what to leave alone

If a user asks a factual question, answer it. Calibration to their level is helpful; pushback or complement is not. If a user is making a decision or working through a problem, the deeper personalization layers earn their keep. Use the speech-act classifier to distinguish — and respect what it says.

## 7.4 What to log, what to discard

Log everything that could plausibly become training data later. Compute is cheap; behavioral data is irreplaceable. The only thing not to log is content the user has explicitly deleted, which must be removed end-to-end.

## 7.5 What to share with users, what to keep internal

Show users a transparent profile of what the system understands about them — but translate from internal representations to natural language. Do not show raw cognitive trait scores or embedding visualizations. The trait names are control variables, not psychological labels for the user. Surface insight, not infrastructure.

# 8. What to never build

Constraints on the product space. These are not areas to revisit later; they are out-of-scope by design.

- A trait-diagnosis feature. Telling users 'you are highly agreeable' or 'your cognitive style is intuitive' is bad psychology, bad product design, and bad ethics. The trait inference exists to inform responses, not to label users.

- A social or sharing layer that exposes other users' profiles. The data is too sensitive.

- Third-party data licensing. The behavioral data is the moat; selling it destroys both the moat and the trust.

- Engagement-maximizing dark patterns. Streaks, push notifications designed to hook, anxiety-inducing copy. The product earns return visits by being useful, not by manufacturing return visits.

- Cognitive load increasing features. The product helps users think better, not feel busier. Adding features that demand more user attention is the opposite of the goal.

- Anything that requires users to share more data than they understand. The deal is: users give us data, we give them genuine personalization, they always know what we have, they can always delete it. This is a hard contract.

# 9. The research evidence base

Why the architectural and product decisions are what they are, in compressed form.

## 9.1 What the research strongly supports

- Memory-backed retrieval beats per-user fine-tuning at MVP scale (LaMP, Mem0, multiple convergent sources)

- Hypothesis-style interpretable personalization is the right pattern (HyPerAlign, NAACL soft-prompting)

- The text-only personality inference ceiling is real and low (Pearson r ≤ 0.27 on validated interview data, multiple independent confirmations)

- Sycophancy in AI is real, documented, and measurable (Anthropic, Stanford, OpenAI's own GPT-4o rollback)

- Personalization-led products have a track record of winning (Spotify, TikTok, Cursor)

## 9.2 What the research does not support

- Cognitive complementarity beats mirroring or neutral behavior. Untested. The A/B exists for this reason.

- Specific cost or accuracy numbers from the Perplexity research, several of which had future-dated arXiv IDs that may be hallucinated. Treat as directional only.

- Off-the-shelf embeddings carrying enough cognitive-style signal. Mixed evidence; plan for fine-tuning later.

- Anti-sycophancy as commercial demand. The research shows users prefer sycophantic AI even when it harms them. The market for honest AI is smaller than the market for personalized AI.

## 9.3 Why the architecture choices are what they are

- Kalman filter over EMA because EMA is a fixed-gain Kalman under restrictive assumptions; the proper version gives posterior variance for free, which is critical for cold-start uncertainty

- Speech-act pre-classifier because emotional messages bleeding into cognitive trait scores was the most predictable failure mode

- Embedding-first user profile rather than rubric-only because embeddings carry richer signal and the rubric becomes one set of readouts among many

- Prompt-level Drift before fine-tuning because Drift outperforms RLHF baselines at MVP scale and avoids the open-frontier-model dependency until necessary

- Behavioral signals as the success metric rather than psychometric accuracy because predicting Big Five from text is near-impossible and the product doesn't need it

# 10. When in doubt

Three questions to ask when facing a hard product decision:

- Does this make the user genuinely better off, or does it just make them more engaged? If the second, the answer is no, even if the metrics would look better short-term.

- Can I A/B test this? If a decision is reversible by data, ship the smaller version and measure. If a decision is irreversible (privacy posture, data architecture, brand positioning), think much harder before committing.

- Is this evidence-backed or hypothesis-driven? Both are valid, but you should know which you're doing. Building on a hypothesis is fine; mistaking a hypothesis for evidence is dangerous.

# 11. The final reminder

Counterpart's bet is that there is a real market for AI that genuinely knows you, and that part of being known is being told what you're missing rather than what you want to hear. The market evidence for the first half is strong. The market evidence for the second half is weak. The product exists to test the second half while monetizing the first half.

The right posture is intellectual honesty about which is which. Lead with personalization, which is well-supported. Earn the right to deepen toward complement, which is unproven. Build infrastructure that lets the data adjudicate. Be willing to update if the data points the other way.

*If at any point the product drifts toward optimizing for engagement at the expense of genuine usefulness — toward sycophancy, dependency, or shallow validation — the founding philosophy has been abandoned. The privacy-respecting, transparency-led, needs-not-wants posture is the brand. Without it, the product is just another AI wrapper.*

*End of principles document.*

*Read alongside the classifier plan and branding document. The three together are the complete brief.*