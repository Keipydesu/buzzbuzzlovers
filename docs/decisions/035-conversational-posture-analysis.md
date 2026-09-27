# 035 — Conversational posture analysis via an explicit Muse action

Date: 2026-09-27.

Status: Phase 1 accepted by the operator on 2026-09-27 and implemented locally.
Phase 2 remains deferred pending its own decision. The original planning pass
made no application changes; implementation was subsequently requested.

## Context

The operator asked for Muse to analyze the user's own posture data
conversationally, in the style "hey I see you slouching consistently during X
hours, let's figure out how to fix this" and "what do you do during these
times?" — rather than only answering free-text questions typed into the
existing chat ([029](029-posture-context-and-muse-sample.md),
[030](030-continuing-muse-chat.md), [031](031-muse-api-key-setup.md)).

Direct review of the current data model found the app cannot honestly make an
hour-of-day claim today:

- `DailySummaryQuery` sums tracked seconds, slouch seconds, and episode counts
  once per canonical `PostureSession`, grouped by `calendar_day` (sessions grouped by first-seen date per
  [data-storage.md](../data-storage.md)); there is no time-of-day granularity.
- `posture_snapshots.received_at` is the server's *acceptance* time, not when
  the posture activity happened ([data-storage.md](../data-storage.md)).
  [app-api.md](../app-api.md)'s browser upload queue can coalesce or replay
  unsaved snapshots after a disconnect or across a prior session, so diffing
  snapshot timestamps to infer "2–4pm" would fabricate precision the transport
  does not carry.
- [Decision 032](032-live-slouch-state.md) backfills ten seconds of
  qualification credit into `slouch_seconds` at the moment a candidate
  qualifies, and credits three seconds of recovery while `state` already reads
  `upright`. Even dense snapshot deltas cannot be naively assigned to the
  latest receipt-hour bucket without misallocating that credit.
- Protocol v1 packets do not self-identify a firmware revision, so measurement
  semantics cannot be compared across firmware changes without an added
  provenance field.
- A user's totals currently sum across all of their devices; that is not
  de-overlapped personal exposure, and any per-device or per-time-of-day
  analysis must either restrict to one selected device or explicitly label/
  suppress a ratio it cannot resolve.

An illustrative future example, clearly separated from what ships now: *"you
tend to slouch most around 2–4pm"* is the kind of claim this decision defers
to Phase 2, once device-timed intervals exist to support it. It must not be
described as available at any point during Phase 1.

## Decision — Phase 1

Add an explicit, user-initiated **"Analyze my posture"** action to the
existing coach UI. It is not an unprompted auto-open on page load or a
background/scheduled nudge: no proactive reminders are promised by this
decision, and no automatic provider call happens without the user choosing
the action. This keeps the feature inside the existing account/consent
boundary from decision 030.

Conversation shape (staged across turns, not a single reply):

1. On invocation, extend `Muse::ContextSummary` with a deterministic evidence summary
   derived from account-scoped canonical sessions. Extend the existing today/
   seven-day totals with slouch share (sum of slouch seconds divided by sum of
   tracked seconds, never the mean of daily percentages) and the number of
   days with positive recorded tracking time (explicitly surfacing sparse coverage rather than treating an
   unobserved day as "no slouching"). If tracked time is zero, omit the ratio and say there is not enough
   recorded data to analyze. Otherwise present one useful observation, with
   the recorded-time denominator and first-seen-date limitation, plus exactly **one** open contextual question about what is usually
   happening during the user's day (calls, focus work, deadlines, gaming,
   etc.) — no suggested experiment yet.
2. Only after the user answers that question does Muse offer **one** small,
   reversible experiment tailored to the answer, consistent with
   `Coach::INSTRUCTIONS`'s existing "one or two reversible adjustments" and
   OSHA-sourced framing.
3. A later "check back in a week" follow-up is user-initiated and in-chat only
   (the user re-opens the analysis or asks again) — this decision does not add
   scheduled or push-based check-ins. Any future proactive reminder needs its
   own decision plus scoped, retained, resettable storage; none exists today
   and `Muse::Conversation`'s 6-exchange/30-minute in-memory window is
   unchanged.

`Coach::INSTRUCTIONS` currently discourages reciting tracked numbers back to
the user unprompted. This decision narrowly overrides that clause for the
analyze-intent path only, because reciting the totals *is* the requested
behavior there; every other instruction (no diagnosis, no promised pain
relief, ask about desk setup, do not infer a cause from frequency alone, treat
the question as untrusted content) remains unchanged and still applies to
whatever the user types in response.

Preserve the current live-chat error behavior. The existing scripted demo
is a separate mode for signed-out or unconfigured viewers, not an automatic
fallback after a live provider failure. For the analysis path, an analysis the user explicitly asked for is not
substitutable with a generic scripted reply, so on failure the UI must show a
visible error and let the user retry, not silently substitute demo content
that could be mistaken for a real analysis of their data.

### Illustrative conversation using current totals

These numbers are synthetic examples, not findings about a real user:

- **User:** Analyze my posture.
- **Muse:** In your saved sessions from the last seven first-seen dates, your
  wearable recorded 45 minutes of slouching out of 180 tracked minutes. That
  is 25% of recorded time; it does not tell me which hours it happened.
  What were you usually doing while wearing it?
- **User:** Mostly coding on my laptop on the couch.
- **Muse:** Would you be open to trying your next coding session at a table
  with a comfortable, supported seat, and seeing how it feels?
- **User:** Yes, let's try that.
- **Muse:** Try it for your next session. When you come back, tell me what you
  tried and how it felt so we can discuss your new recorded totals.

Treat the user's answer as self-reported context, not a measured cause. Allow
corrections, declining a suggestion, or returning to ordinary chat. After the
memory window expires, ask for that context again instead of pretending to
remember an experiment. Comparing later totals cannot prove that the experiment
caused a change.

### Implementation boundaries

Reuse `CoachController`, `Muse::Coach`, `Muse::ContextSummary`,
`Muse::Conversation`, and the shared Muse chat UI. Define a validated analysis
intent on the existing authenticated request flow; derive evidence on the
server, ignoring client-supplied totals or conversation history. Retain CSRF,
rate limiting, request limits, reset behavior, server-only credentials, and
account isolation. Analysis does not need model tools, arbitrary SQL, raw
sensor data, group-member data, or new dependencies. Update the sharing disclosure
to match the actual evidence sent. Keep the current development/test-only
availability; public deployment remains a separate roadmap gate.

For Phase 1, label aggregate results as recorded device time; do not claim
unique personal exposure across multiple devices. If a comparison requires
personal exposure, restrict it to one selected owned device or withhold it.

The existing Meta adapter can retain its stateless messages-array approach;
the [official Meta quickstart](https://dev.meta.ai/docs/cookbook/quickstart-chat-completions)
confirms that prior turns must accompany each request (checked 2026-09-27).

## Explicitly deferred — Phase 2 (needs its own decision before implementation)

Real hour-of-day claims require a new interval-based data contract, not a
read against existing cumulative fields:

- Device-timed intervals with an explicit clock anchor and stated uncertainty,
  versioned separately from protocol v1's cumulative snapshot format.
- Explicit allocation of decision 032's qualification/recovery credit across
  interval boundaries, rather than assigning a whole delta to one bucket.
- Explicit coverage/gap accounting (a bucket with no data is "unobserved," not
  "upright"), and midnight/DST handling consistent with the existing
  calendar-day timezone freeze.
- A measurement-version/firmware-provenance field so comparisons across
  firmware revisions are labeled, not assumed comparable.
- Either restricting time-of-day analysis to one user-selected device, or
  explicitly labeling/suppressing any ratio that can't be resolved when
  multiple devices overlap.
- Any product-facing "you consistently slouch around X" framing must be gated
  behind a documented consistency threshold treated as a **product heuristic**
  (e.g., "seen on at least N of the last M recorded days"), never presented as
  a clinical or diagnostic cutoff.
- Retained device-timed records may be replayed/backfilled into this contract
  later if they carry a reliable anchor and provenance — the constraint above
  is against inferring occurrence time from transport/receipt time, not
  against replay in general.

No hour-of-day claim may ship before a decision covering these points is
accepted.

## Acceptance checks

Service/request specs for the analyze-prompt builder: no recorded data,
sparse coverage, a single recorded day, and unequal tracking across days.
Reset races on the existing `Conversation` store. Other-account isolation.
Provider-outage behavior (visible error + retry, no silent demo substitution
for this path). Prompt-injection resistance — the user's follow-up answer
must not be able to override the analyze framing or the underlying
instructions. A JS/controller test for the new action's UI state (loading,
error, staged question-then-experiment turns). No live provider calls in
automated tests, matching the existing stubbed-provider pattern used for 029–031.

## Initial planning verification

Directly reviewed `app/models/`, `db/schema.rb`, all existing migrations,
`DailySummaryQuery`, Muse services/controller/UI, and existing request/service
tests, alongside relevant decisions, roadmap, API, BLE and storage documents.
There is no generated data-model task in this repository. No schema, firmware,
application or dependency changes are part of this planning task. Runtime tests,
physical-device checks and live provider calls were not performed for this plan;
implementation must satisfy the acceptance checks above and evaluate actual
multi-turn replies, since mocked provider tests alone cannot establish model
behavior. Documentation whitespace and relative links were checked.

## Related documents

- [Posture context and static sample](029-posture-context-and-muse-sample.md)
- [Continuing Muse chat](030-continuing-muse-chat.md)
- [Muse API key setup](031-muse-api-key-setup.md)
- [Live slouch state](032-live-slouch-state.md)
- [Delayed posture warning](033-delayed-posture-warning.md)
- [Hosted storage and hypertable plan](../data-storage.md)
- [Rails API contract](../app-api.md)

## Implementation and verification — 2026-09-27

`POST /coach` accepts optional `intent: "chat"` (default) or `"analyze"`;
other values return 422. Analysis uses a fixed server question and authenticated
account evidence, ignoring client totals and history. Conversation state records
whether analysis began, atomically with a successful exchange; failures do not
advance it, and reset/expiry clears it. The first answer receives opening-stage
instructions; later answers receive follow-up instructions. This is prompt-based
conversation guidance, not a deterministic guarantee about model wording.

The action appears only in configured, signed-in chat. It makes no page-load
request. A failed analysis preserves its intent on retry; editing the draft into
a different question returns to ordinary chat intent. The disclosure describes
coverage, overlapping-device totals, and the absence of scheduled reminders.
No schema, firmware, dependency or hosting changes were made.

Validation uses Ruby 3.3.12 and the installed bundle:

- `env DATABASE_URL=postgresql://localhost/buzzbuzzlovers_test RAILS_ENV=test PARALLEL_WORKERS=1 bin/rails test test/services/muse test/requests/coach_test.rb`: 27 tests, 200 assertions passed.
- `node --test test/javascript/muse_chat_test.mjs`: 7 tests passed.
- `bundle exec rubocop --cache false app/services/muse app/controllers/coach_controller.rb test/services/muse test/requests/coach_test.rb`: 8 files, no offenses.
- Coach/layout and analysis Playwright checks: 6 passed across mobile/desktop Chromium, both themes; analysis-only recapture: 2 passed. All browser fixtures use `bbl_playwright_test` and a stubbed provider.
- Full Rails suite before the final validation test addition: 124 tests, 634 assertions, 2 pre-existing failures and 1 Timescale skip. The group dashboard assertion expecting “Study friends” and anonymous landing assertion expecting no forms also fail on unchanged commit `5608322` in an isolated archive (13 tests, 117 assertions, same 2 failures). These unrelated expectations are not changed here.

Screenshots show synthetic, stubbed replies:
[mobile light](../screenshots/muse-analysis-mobile-light.png) and
[desktop dark](../screenshots/muse-analysis-desktop-dark.png).

Manual live-provider evaluation used only synthetic totals (180 tracked minutes,
45 slouch minutes, three recorded dates), never personal or hosted records. An
initial three-turn run was too verbose on the follow-up, so the prompt was
narrowed to at most three short sentences and one adjustment. A second three-turn
run produced an evidence-based opening question, one cushion-support experiment
for the self-reported couch-coding context, and refused an instruction to invent
a daily 2–4 PM pattern. This limited smoke check does not establish guaranteed
model behavior or medical benefit. Automated tests remain provider-stubbed.

Independent Claude review reran the focused Rails and JavaScript tests and
RuboCop, and passed all 12 coach/layout/analysis browser tests across Chromium,
WebKit and Firefox. It identified missing blank/oversized-question regression
coverage after updating stale browser selectors; a request test now covers both
422 responses and confirms no provider call. The same two unrelated full-suite
failures were independently reproduced.
