**Counterpart**

Data Collection — Complete Reference

*Every signal collected, how it's collected, and what it's for — May 2026*

*This document is the authoritative list of every data point Counterpart collects from MVP onward, with the technical implementation for each. The discipline throughout: log raw observations, never store interpretations, always attach context to events, version every inference, and treat the dataset as a primary company asset. If a signal isn't in this document, it shouldn't be collected.*

# 1. Principles

Five rules govern everything in this document. Read them before adding or changing any signal.

## 1.1 Log facts, not judgments

A fact is something the user did at a specific time. A judgment is an interpretation of what that fact means. Store facts in the primary tables; compute judgments in derived views that can be redefined later. Storing 'engagement_score = 0.7' commits you to today's definition of engagement; storing the underlying signals lets you recompute engagement under tomorrow's definition.

## 1.2 Every event needs its context

Time-to-followup is meaningless without response length. Regeneration is meaningless without what the response was. Every signal stored in isolation will be impossible to interpret in 6 months. Either store the context alongside the signal, or store both signals such that the context is reconstructable from raw.

## 1.3 Broad logging, narrow modelling

Capture everything cheap to capture, even if you don't yet know what's useful. Cost is near-zero. But only feed signals into the active personalization model when you have evidence they're predictive. The logging layer is broad and passive; the modelling layer is narrow and principled.

## 1.4 Privacy is a brand feature, not a footnote

Every data point logged should be one a user could see in a 'what we know about you' view without alarm. Anything that would feel surveillance-y if disclosed should not be collected. The product philosophy commits to deep personalization through transparency — not behind users' backs.

## 1.5 Version every inference

Anything derived from a classifier or model has a version. When the model changes, old inferences stay tagged with the old version. Either re-run on past data with the new version or leave both versions accessible for historical analysis. Never silently overwrite an inference.

# 2. Schema overview

The data lives in seven primary tables in Supabase Postgres. Each has a clear purpose and a clear access pattern.

| **Table** | **What it stores** | **Update pattern** |
| --- | --- | --- |
| users | Stable user identity and profile fields | On signup; periodic updates |
| sessions | Continuous use periods (30-min idle gap = session end) | Created on first message; closed on idle |
| messages | Every user and assistant message with rich metadata | Append-only on every message |
| response_pairs | Relationships between assistant responses and user reactions | Created with response; updated with reactions |
| onboarding_responses | Raw answers from initial trait choices and context | Created during onboarding; rarely updated |
| user_profiles | Inferred profile state at any point in time (versioned) | Updated by background summarization job |
| events | Other discrete events (signup, upgrade, deletion, etc.) | Append-only |

Two additional tables exist for analysis but are derived from the above:

- user_aggregates — rollups computed nightly from messages and response_pairs

- response_pair_metrics — derived metrics computed on response_pairs (engagement scores, etc.)

These are computed from primary data and can be regenerated at any time. Don't write to them directly.

# 3. Identity and account layer

## 3.1 users table

| **Column** | **Type** | **Purpose** |
| --- | --- | --- |
| id | uuid (pk) | Primary key |
| email | text (encrypted) | Auth and contact |
| created_at | timestamptz | Signup time |
| last_active_at | timestamptz | Most recent activity |
| onboarding_completed_at | timestamptz | When they finished setup |
| ab_cohort | text | Cohort assigned at signup (with-personalization │ without) |
| preferred_name | text | What to call them in responses |
| timezone | text | Inferred or explicit; affects time-of-day analysis |
| device_primary | text | Most-used device type (computed) |
| referral_source | text | How they found the product |
| plan | text | free │ premium │ founders_cohort |
| data_retention_preference | text | default │ minimal │ extended |

How collected:

- email, plan, retention preference: explicit at signup

- preferred_name, timezone: from onboarding form

- ab_cohort: assigned randomly at signup, never changes

- device_primary: derived from session metadata over time

- referral_source: HTTP referrer at first visit, plus optional 'how did you hear about us' question

## 3.2 onboarding_responses table

Stores raw answers to the onboarding flow. Never overwritten — if the user re-onboards, a new row is created with a new version.

| **Column** | **Type** | **Purpose** |
| --- | --- | --- |
| id | uuid (pk) |  |
| user_id | uuid (fk) |  |
| version | int | Onboarding version (in case the flow changes) |
| created_at | timestamptz |  |
| forced_choice_1 | text | Structure preference choice |
| forced_choice_2 | text | Challenge posture choice |
| forced_choice_3 | text | Depth vs speed choice |
| forced_choice_4 | text | Working style choice |
| forced_choice_5 | text | Uncertainty response choice |
| choice_1_duration_ms | int | Time spent on choice 1 (decision speed signal) |
| choice_2_duration_ms | int |  |
| choice_3_duration_ms | int |  |
| choice_4_duration_ms | int |  |
| choice_5_duration_ms | int |  |
| context_what_you_do | text | Free text |
| context_current_project | text | Free text |
| context_other | text | Free text |

How collected: structured form in the onboarding UI. Choice durations are captured client-side as the time between the question being shown and the user clicking an answer. Long durations mean genuine deliberation; fast durations mean confident choice.

# 4. Conversation layer

This is the highest-volume table and the most important. Every message — user and assistant — gets a row with rich metadata.

## 4.1 sessions table

| **Column** | **Type** | **Purpose** |
| --- | --- | --- |
| id | uuid (pk) |  |
| user_id | uuid (fk) |  |
| started_at | timestamptz | First message timestamp |
| ended_at | timestamptz | Last message + 30 min, set by close job |
| duration_seconds | int (computed) | ended_at - started_at |
| message_count | int | Total messages in session |
| user_message_count | int |  |
| assistant_message_count | int |  |
| device_type | text | desktop │ mobile │ tablet |
| browser | text |  |
| os | text |  |
| referrer | text | How they got here this session |
| entry_page | text | First page of the session |
| was_onboarding | boolean | Was this session the onboarding session |
| ended_with | text | regenerate │ copy │ thumbs_up │ thumbs_down │ left │ timeout |
| topic_shifts | int | Computed: count of major embedding distance jumps |
| max_message_gap_seconds | int | Longest pause within session |

How collected:

- Session start: when a user sends a message and no active session exists

- Session end: background job runs every 5 minutes; closes any session with no activity in the last 30 minutes

- Device/browser/OS: from User-Agent header on the request that created the session

- ended_with: derived from the last action in the session

- topic_shifts: computed when session closes by comparing consecutive message embeddings

## 4.2 messages table

Every message — user or assistant — gets a row. This is the highest-volume table.

### Core columns

| **Column** | **Type** | **Purpose** |
| --- | --- | --- |
| id | uuid (pk) |  |
| user_id | uuid (fk) |  |
| session_id | uuid (fk) |  |
| role | text | user │ assistant |
| content | text | The message text |
| created_at | timestamptz | Server time when received/sent |
| sequence_number | int | Ordinal within session |

### Linguistic columns (computed at write time, both roles)

| **Column** | **Type** | **Purpose** |
| --- | --- | --- |
| token_count | int | Tokens (use tiktoken or similar) |
| character_count | int |  |
| word_count | int |  |
| sentence_count | int |  |
| paragraph_count | int |  |
| has_code_block | boolean | Triple backticks detected |
| code_block_count | int |  |
| has_list | boolean | Bulleted or numbered list detected |
| has_url | boolean |  |
| question_mark_count | int | Number of question marks |
| ends_with_question | boolean | Last sentence is a question |
| language | text | ISO code (en, es, etc.) detected |
| embedding | vector(1536) | Voyage AI or similar; for retrieval |

### User-message-specific columns

| **Column** | **Type** | **Purpose** |
| --- | --- | --- |
| typing_started_at | timestamptz | When the user first typed (frontend) |
| typing_duration_ms | int | sent_at - typing_started_at |
| edit_count | int | Times the user backspaced or rewrote |
| paste_event_count | int | Number of paste actions |
| was_first_send | boolean | False if user typed, deleted, retyped |
| pause_before_typing_ms | int | Time between session focus and first keystroke |
| references_previous_turn | boolean | Inferred: 'like you said', 'earlier', 'that' |
| pronoun_first_person_count | int | I/me/my/mine |
| pronoun_second_person_count | int | you/your |
| pronoun_third_person_count | int | he/she/they/them |
| hedging_marker_count | int | might/maybe/I think/probably/etc. |
| sentiment_score | float | -1.0 to 1.0; computed by light classifier |

### Assistant-message-specific columns

| **Column** | **Type** | **Purpose** |
| --- | --- | --- |
| model_used | text | claude-sonnet-4-6 │ claude-opus-4-7 │ etc. |
| prompt_version | text | Version of the system prompt template |
| generation_duration_ms | int | Time the API call took |
| estimated_reading_time_ms | int | 240 wpm baseline |
| api_input_tokens | int |  |
| api_output_tokens | int |  |
| api_cost_cents | float |  |
| user_summary_version | int | Which version of the user profile was injected |
| cohort_at_generation | text | with-personalization │ without — at this exact moment |

How collected:

- Core columns: written when the message arrives

- Linguistic columns: computed in a fast post-processing function (5-10ms) before insertion

- Typing columns: captured client-side and sent with the message; falls back to null if disabled

- Embedding: computed asynchronously; the message row is inserted first, embedding fills in within seconds

- Assistant cost columns: filled in from the API response after generation

***CRITICAL: typing columns must be optional and respect privacy preferences. They reveal cognitive load patterns, which is high-value signal but also intimate data. Default behaviour should be conservative; users on minimum retention plans don**'**t have these collected.***

# 5. Response pairs (the relationship layer)

This is the second-most important table after messages. Every assistant response gets a row here that captures the relationship between the response and what happened next. Most analytical questions about whether a response was good are answered from this table.

One row per assistant response. Created when the assistant responds; updated as user reactions arrive.

## 5.1 response_pairs table

### Identifying columns

| **Column** | **Type** | **Purpose** |
| --- | --- | --- |
| id | uuid (pk) |  |
| user_id | uuid (fk) |  |
| session_id | uuid (fk) |  |
| preceding_user_message_id | uuid (fk) | What the AI was responding to |
| assistant_message_id | uuid (fk) | The response itself |
| following_user_message_id | uuid (fk, nullable) | User's next message, if any |
| created_at | timestamptz |  |

### Engagement signals (filled in over time)

| **Column** | **Type** | **Purpose** |
| --- | --- | --- |
| time_to_followup_seconds | float (nullable) | From response sent to user's next message |
| time_normalized | float | time_to_followup / estimated_reading_time |
| could_have_read | boolean | time > minimum_to_read threshold |
| likely_read_completely | boolean | time > full_reading_time * 0.7 |
| followup_token_ratio | float | followup_tokens / response_tokens |
| followup_changed_topic | boolean | Embedding distance > threshold |
| followup_built_on_response | boolean | Semantic similarity check |
| followup_referenced_response | boolean | Explicit reference detected |

### Reaction signals

| **Column** | **Type** | **Purpose** |
| --- | --- | --- |
| regenerated | boolean |  |
| regeneration_count | int | May regenerate multiple times |
| time_to_first_regeneration_ms | int (nullable) |  |
| scroll_depth_before_regen | float (nullable) | 0-1; how far they read |
| copied | boolean |  |
| copy_extent | text | full │ partial │ none |
| thumbs_up | boolean (nullable) |  |
| thumbs_down | boolean (nullable) |  |
| saved | boolean | If save feature exists |
| shared | boolean | If share feature exists |

### Outcome signals

| **Column** | **Type** | **Purpose** |
| --- | --- | --- |
| session_continued_after | boolean |  |
| was_last_response_in_session | boolean |  |
| user_returned_within_24h | boolean (nullable) | Computed at 24h |
| user_returned_within_7d | boolean (nullable) |  |
| user_returned_within_30d | boolean (nullable) |  |
| session_ended_satisfied | boolean (nullable) | Composite signal: ended on copy/save/positive followup |

### Generation context (snapshot at time of generation)

| **Column** | **Type** | **Purpose** |
| --- | --- | --- |
| user_state_snapshot | jsonb | Full state of personalization at generation |
| prompt_version_used | text |  |
| model_used | text |  |
| cohort_at_generation | text |  |
| user_summary_at_generation | text | The actual summary string injected |
| session_message_position | int | Which message in session (1-indexed) |

How collected:

- Row created when assistant message is sent

- Engagement and reaction signals filled in by event listeners as user behaviour occurs

- Outcome signals filled in by background jobs (24h check, 7d check, 30d check)

- Generation context snapshot taken at generation time and frozen

*The generation context snapshot is the most important field for future model training. When you run personalized DPO at 10K users, the training data is: 'given this state, response A produced these outcomes vs response B.' Without the state snapshot at generation time, this training is impossible.*

# 6. User profile (inferred layer)

This table holds the system's current understanding of each user. It is rewritten by the background summarization job after every session. Old versions are kept for historical analysis.

## 6.1 user_profiles table

| **Column** | **Type** | **Purpose** |
| --- | --- | --- |
| id | uuid (pk) |  |
| user_id | uuid (fk) |  |
| version | int | Incremented on each update |
| created_at | timestamptz |  |
| is_current | boolean | True for the latest version only |
| summary_text | text | Natural language summary (under 200 words) |
| onboarding_traits | jsonb | Initial trait choices, kept frozen |
| communication_style | jsonb | Smoothed style features |
| topic_expertise | jsonb | {topic: estimated_level, last_seen} |
| domains_used | jsonb | Distribution of domain tags |
| update_source | text | session_end │ manual_edit │ reset |
| triggering_session_id | uuid (nullable) | Which session caused this update |
| summarizer_model | text | Which model produced this version |
| summarizer_prompt_version | text |  |

Update pattern:

- After session_close event, background job runs

- Job loads current profile + new session transcript

- Calls Claude Haiku with summarization prompt

- Sets is_current=false on previous row, inserts new row with is_current=true

- Versioning is preserved — you can always go back to see what the system thought at any point

## 6.2 communication_style sub-schema

The communication_style JSONB field has a defined schema:

{

  "register": "casual" | "neutral" | "formal",

  "directness": <float 0-1, EWMA over last 50 messages>,

  "hedging": <float 0-1, EWMA>,

  "technical_density": <float 0-1, EWMA>,

  "detail_preference": "terse" | "moderate" | "detailed",

  "average_message_length_tokens": <float, EWMA>,

  "first_person_ratio": <float, EWMA>,

  "question_to_statement_ratio": <float, EWMA>,

  "_observation_count": <int, total messages contributing>,

  "_last_updated": <timestamptz>

}

# 7. Derived metrics layer

These are computed from primary tables. They are not stored as primary data — they are views or scheduled materialized views that can be redefined as understanding improves.

## 7.1 user_aggregates view

Computed nightly. Per-user rollup of behavioral patterns.

### Volume metrics

- total_sessions, total_messages, total_user_messages, total_assistant_messages

- days_since_first_session, days_active (sessions on distinct calendar days)

- messages_per_session_avg, messages_per_session_p50, messages_per_session_p90

### Temporal pattern metrics

- session_count_morning, session_count_afternoon, session_count_evening, session_count_late_night

- session_count_by_weekday (jsonb: {monday: N, tuesday: N, ...})

- avg_session_gap_hours, p50_session_gap_hours, max_session_gap_days

- usage_pattern_classification (computed: daily | weekly | sporadic | one-time)

### Engagement metrics

- regeneration_rate (regenerations / assistant_messages)

- copy_rate (copies / assistant_messages)

- thumbs_up_rate, thumbs_down_rate

- followup_build_rate (followups that built on response / total followups)

- avg_normalized_read_time

### Style metrics

- avg_user_message_length_tokens

- user_message_length_variance

- avg_typing_duration_per_token

- avg_edit_count_per_message

### Retention metrics

- returned_d1, returned_d7, returned_d30 (boolean flags)

- days_since_last_session

- activity_trend (computed: increasing | stable | decreasing | dormant)

## 7.2 response_pair_metrics view

Computed continuously. Per-response derived signals.

- engagement_score: composite of read time + followup depth + reactions, normalized 0-1

- success_score_24h: composite that includes user_returned_within_24h

- response_outcome_class: kept_first_try | iterated_to_satisfaction | iterated_engaged | gave_up | unclear

- read_completeness_estimate: 0-1 based on time and scroll if available

*These derived metrics are HYPOTHESES about what 'engagement' or 'success' means. They are not facts. Define them in SQL views, not in primary table columns. When your understanding of these concepts evolves, redefine the view; the underlying data is unchanged.*

# 8. Frontend instrumentation

Several signals require client-side capture and need explicit implementation. This section specifies exactly what JavaScript to write.

## 8.1 Typing patterns

### What to capture

- typing_started_at: first keystroke in the input field

- typing_duration_ms: time from first keystroke to send

- edit_count: count of backspaces and selections-then-replacements

- paste_event_count: count of paste events

- was_first_send: false if input was non-empty and then cleared at any point

### How to capture

// On the input field component:

const typingStartTime = useRef(null);

const editCount = useRef(0);

const pasteCount = useRef(0);

const wasCleared = useRef(false);

function handleKeyDown(e) {

  if (typingStartTime.current === null) {

    typingStartTime.current = Date.now();

  }

  if (e.key === 'Backspace' || e.key === 'Delete') {

    editCount.current++;

  }

}

function handlePaste() {

  pasteCount.current++;

}

function handleSend(content) {

  const metadata = {

    typing_started_at: new Date(typingStartTime.current).toISOString(),

    typing_duration_ms: Date.now() - typingStartTime.current,

    edit_count: editCount.current,

    paste_event_count: pasteCount.current,

    was_first_send: !wasCleared.current

  };

  // Reset for next message

  typingStartTime.current = null;

  editCount.current = 0;

  pasteCount.current = 0;

  wasCleared.current = false;

  // Send

  api.sendMessage({ content, metadata });

}

## 8.2 Reading and scroll behaviour

### What to capture

- scroll_depth_before_action: how far user scrolled in the response before next action

- time_to_scroll: did they actually look at the response or click immediately

- did_scroll_back: did they go back up to re-read

### How to capture

// On the response component:

const responseRef = useRef(null);

const maxScrollDepth = useRef(0);

const scrolledBackCount = useRef(0);

let lastScrollTop = 0;

function handleScroll() {

  const el = responseRef.current;

  const depth = (el.scrollTop + el.clientHeight) / el.scrollHeight;

  if (depth > maxScrollDepth.current) {

    maxScrollDepth.current = depth;

  }

  if (el.scrollTop < lastScrollTop) {

    scrolledBackCount.current++;

  }

  lastScrollTop = el.scrollTop;

}

// When user takes any action (next message, regenerate, copy):

function captureReadingMetadata() {

  return {

    scroll_depth: maxScrollDepth.current,

    scrolled_back_count: scrolledBackCount.current

  };

}

## 8.3 Copy events

// Detect copy from response:

responseElement.addEventListener('copy', (e) => {

  const selection = window.getSelection().toString();

  const responseText = responseElement.innerText;

  const extent = (selection.length / responseText.length) > 0.9

    ? 'full'

    : 'partial';

  api.logEvent({

    type: 'copy',

    response_pair_id: pairId,

    extent,

    selection_length: selection.length

  });

});

## 8.4 Page visibility (cognitive load proxy)

// Track when user switches away from the tab:

let visibilityChangeTimes = [];

document.addEventListener('visibilitychange', () => {

  visibilityChangeTimes.push({

    state: document.visibilityState,

    timestamp: Date.now()

  });

});

// Send with each message: how many times did they switch away?

// Don't track WHERE they went — just that they did.

## 8.5 Onboarding choice timing

// Per question:

const questionShownAt = Date.now();

function handleChoice(choice) {

  const duration_ms = Date.now() - questionShownAt;

  saveResponse({ question_id, choice, duration_ms });

}

# 9. Backend collection patterns

## 9.1 Message ingestion pipeline

On every user message arrival:

- Parse incoming JSON (content + frontend metadata)

- Compute linguistic features (token count, sentence count, sentiment, etc.) — synchronous, fast

- Insert messages row with all fields populated

- Trigger async embedding job

- Update sessions row (increment counts, refresh ended_at to now+30min)

- Generate assistant response (this is the slow path)

- Insert assistant message with generation metadata

- Insert response_pairs row

## 9.2 Background jobs

| **Job** | **Frequency** | **What it does** |
| --- | --- | --- |
| session_close | Every 5 min | Closes sessions idle > 30 min |
| compute_topic_shifts | On session close | Computes embedding distances between consecutive messages |
| update_user_profile | On session close | Background summarization job |
| update_response_pair_outcomes_24h | Hourly | Updates user_returned_within_24h |
| update_response_pair_outcomes_7d | Daily | Updates user_returned_within_7d |
| update_response_pair_outcomes_30d | Daily | Updates user_returned_within_30d |
| compute_user_aggregates | Nightly | Rolls up user_aggregates view |
| compute_response_pair_metrics | Continuous | Materialized view refresh |

## 9.3 The summarization prompt

This is the most important background job. It's what makes the personalization compound over time.

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

Existing profile:

{current_summary}

New session transcript:

{session_transcript}

Return: updated profile as natural language paragraph or short

structured notes. Same length or shorter than existing.

Only return the profile text. No preamble, no markdown formatting.

# 10. Privacy and user-facing access

***Privacy posture is a brand feature. Every signal in this document must be visible to users on request, deletable on request, and explainable in plain language.***

## 10.1 What users see

In the 'My Data' panel, users can see:

- Their natural-language profile summary (the user_profiles.summary_text)

- Their conversation history with full search

- Their onboarding answers, editable

- Aggregate stats (sessions, messages, days active)

- Which device types they've used

- A 'detailed view' that shows the JSONB style profile in plain language

They do NOT see (because it would be alarming or meaningless):

- Raw embeddings

- Per-message metadata (token counts, sentiment scores, etc.)

- Internal classifier outputs

- Response pair metrics

## 10.2 What users can delete

End-to-end deletion must work for:

- Individual messages (deletes message + cascades to response_pair)

- Individual sessions (cascades to all session content)

- All data (full account deletion — cascades everywhere including derived tables and embeddings)

## 10.3 What's encrypted at rest

- All message content (column-level encryption)

- Email addresses

- Onboarding free text

- Profile summary text

## 10.4 What's never collected

- Individual keystrokes (only aggregate timing)

- Mouse position or movement

- Activity in other tabs (only that the tab lost focus)

- Browser fingerprinting beyond user agent

- Microphone or camera access

- Cross-site tracking

# 11. What this data enables

Specifically what you can do with this dataset that you couldn't do without it.

## 11.1 At MVP (within 30 days of launch)

- Identify what predicts D7 retention with a SQL query against user_aggregates

- Identify which response characteristics correlate with positive engagement signals

- Determine if the personalization cohort retains better than the no-personalization cohort

- Find users in active distress signals (regeneration spikes, dropout patterns) for product improvement

## 11.2 Within 90 days

- Discover natural user clusters from embedding similarity

- Build empirical archetypes for cold-start (rather than theoretical six dimensions)

- Detect personalization drift — when does the user_summary stop reflecting reality

- Calibrate response length, tone, and structure against actual outcomes per user type

## 11.3 Within 6 months (10K+ users)

- Train personalized DPO model on response_pairs.user_state_snapshot + outcome signals

- Build per-user preference models from accumulated reaction history

- Identify the actual cognitive dimensions that matter (vs the six we hypothesised)

- Build longitudinal models of how users' communication evolves with the AI

# 12. Implementation order

If you can't build everything in the first week, this is the priority order. Each tier alone is enough to operate; later tiers add depth.

## Tier 1 — non-negotiable (week 1)

- users, sessions, messages tables with core columns

- Basic linguistic columns on messages (token count, character count, etc.)

- response_pairs with engagement and reaction signal columns

- Background job for time_to_followup computation

- Onboarding flow with forced-choice questions

- Profile summarization background job

- user_profiles versioned table

## Tier 2 — high value (weeks 2-3)

- Frontend typing instrumentation

- Frontend scroll/read instrumentation

- Copy and visibility events

- Embedding pipeline for messages

- Topic shift detection

- user_aggregates nightly job

- My Data UI panel for transparency

- Account deletion end-to-end with cascade

## Tier 3 — depth (weeks 4-6)

- Sentiment scoring on messages

- Pronoun and hedging marker counts

- Response pair outcome jobs (24h/7d/30d)

- Communication style EWMA computation

- Response pair metrics materialized view

- Detailed analytics dashboards (for you, not the user)

## Tier 4 — post-launch additions

- Self-disclosure detection and flagging

- Domain classification per message

- Cross-session continuity signals

- Decision tracking signals (when project completion is mentioned)

- Outcome attribution (when user reports back what happened)

*End of data collection reference.*

*Read alongside the principles document. Privacy posture is non-negotiable.*