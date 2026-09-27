# App plan (Rails + browser)


Current follow-up: [decision 017](decisions/017-ten-second-slouch-grace.md) replaces the one-minute rule with ten-second qualification/full-candidate credit and three-second reset. [Decision 018](decisions/018-mvp-first-connection-registration.md) replaces mandatory manual provisioning with trusted first-use registration for MVP. Existing ownership remains protected; stronger enrollment is still required for an untrusted public rollout. Historical proposals below yield to these decisions.

Current integration reference (2026-09-26): [hardware integration plan](hardware-integration-plan.md), [BLE source contract](ble-protocol.md), and [current API](app-api.md). Firmware now exists under `Hardware/`; accounts, ownership, canonical sessions, and atomic accepted history are implemented in Rails. The immediate target is the local demo; the browser adapter is implemented with automated fixture coverage; physical device validation remains pending. Historical proposals below are superseded where they describe absent hardware/accounts/history or public hosting as the immediate milestone.

**Status: architecture proposal; Rails persistence/API scaffold under review, hosted integration not implemented.** Scope is the app side only: the browser BLE adapter and the Rails web app. Wire-level BLE fields, UUIDs, and encoding are defined in [ble-protocol.md](ble-protocol.md) and are not repeated here except where the app-side contract depends on them. See [ROADMAP.md](ROADMAP.md) for how this fits the overall sequencing (this document is Phase 3 + Phase 4 detail).

The ESP32 owns all posture classification. Nothing here recomputes posture state from raw sensor data; the app only stores and displays values the device already calculated.

## Proposed stack and application structure

Ruby on Rails is the confirmed preference. Recommend a conventional Rails app with ERB views, Turbo navigation, Stimulus for the BLE adapter and chart updates, Tiger Cloud PostgreSQL/TimescaleDB for hosted persistence, and Tailwind CSS for responsive styling. Tiger Data online storage is the chosen direction; managed hosting details and exact versions are proposals, and scaffold dependencies have not thereby been certified as vetted. See [data-storage.md](data-storage.md) for the integration plan. Keep one Rails app; the browser receives live BLE data directly, so a separate frontend service or push server is unnecessary for the initial journey.

All stack selections, scaffold-generated gems, and later dependency updates must satisfy [the dependency safety policy](dependency-safety.md). Select established dependencies and supported versions with documented security review; do not default to brand-new packages or unreviewed latest releases. Review direct and transitive dependencies before installation, commit the resulting lockfiles, and record audit tooling and commands when implementation begins.

Proposed source organization once implementation is authorized:

```text
app/models/device.rb, posture_session.rb
app/controllers/api/v1/       # JSON endpoints from app-api.md
app/services/snapshots/       # validation and transactional reconciliation
app/queries/                 # daily/weekly summaries
app/javascript/controllers/  # connection and dashboard UI
app/javascript/ble/          # decoder, real/fixture transports, upload queue
app/views/dashboard/         # primary mobile-first screen
test/                        # Rails model/request/summary tests
```

Lead the dashboard with today’s slouch-frequency bar chart, with goals and current connection status secondary, per [decision 007](decisions/007-lead-with-habit-trends.md). Add an explicitly labeled weekly average to seven-day history. The preview timeline is synthetic: the cumulative API cannot yet provide accurate time-bucketed episodes. The connect flow can be inline; no separate onboarding or settings area is required. Keep essential buttons touch-sized, labels readable, charts paired with textual totals, and status changes understandable without relying on color.

## Open decisions and provisional defaults

**Session start/end and calibration controls.** [ble-protocol.md](ble-protocol.md) leaves this unresolved (MVP.md open decision 6). Revised default after review: **physical/device-side controls, with the browser read-only** for v1. A browser-issued command (start/end/calibrate over a write characteristic) needs command IDs, device acknowledgment, and retry/idempotency handling so a retried write can't create a duplicate session or leave the device in an ambiguous state — plus corresponding pending/failure UI. That's real protocol and UI work the read-mostly MVP doesn't need yet. Keep it as an optional command extension if the team decides the demo needs browser-driven controls instead.

The app must still show **Connect/Disconnect** (browser BLE link) as distinct from **Start/End** (device session state) — losing the BLE connection is not the same as the device ending a tracking session, and the UI must never imply otherwise.

This remains a recommendation pending an explicit team/operator decision, not something either agent is locking in silently. Nothing below assumes calibration UI beyond a read-only "calibrating" status.

## Data model

The scaffold baseline has two canonical tables and no per-episode records (only cumulative counts/durations are transmitted). The hosted proposal adds users and server-derived ownership, plus a separate accepted-snapshot hypertable; it does not convert these canonical tables to hypertables. The schema below is the baseline, extended by [data-storage.md](data-storage.md). Named `PostureSession` rather than `Session` to avoid colliding with Rails' own session/auth concepts once accounts exist.

```
devices
  id            string pk, 32-char lowercase hex (opaque identifier decoded from ble-protocol.md's identity characteristic; not client-assignable as a credential — see registration below)
  first_seen_at
  last_seen_at

posture_sessions
  id                  bigint pk (app-internal)
  device_id           fk -> devices.id
  device_session_id   bigint (the BLE `session_id` field; unique together with device_id — stored as bigint/with a check constraint even though the wire field is uint32, since a signed 32-bit SQL integer can't hold the full uint32 range)
  protocol_version    integer (stored canonical field, currently 1)
  last_sequence       bigint (same uint32-range reasoning)
  state               string (mirrors ble-protocol.md's state enum: idle/calibrating/upright/slouching/sensor_error/ended)
  tracked_seconds     bigint
  slouch_seconds      bigint
  episode_count       integer (wire field is uint16, fits a signed 32-bit integer)
  ended               boolean
  first_received_at   timestamp (server receipt time of the first snapshot for this session — transport metadata, NOT the device's session start, and distinct from whatever moment the browser itself first observed the snapshot over BLE; retries and reconnects can make these three times all differ)
  last_received_at    timestamp
  first_observed_at   timestamp (browser's first observation for this session; frozen at first insertion, not the actual device start time)
  calendar_timezone  string (configured profile timezone frozen with the bucket)
  calendar_day        date (first_observed_at converted to calendar_timezone; frozen once, labeled first-seen-date grouping rather than genuine calendar-day accounting)
```

`(device_id, device_session_id)` has a unique index. The first committed insertion freezes observation metadata; subsequent writes are ordered by `sequence`. Store and compare all canonical fields: protocol version, state, sequence, tracked/slouch seconds, and episode count. Observation metadata is excluded from duplicate checks. Enforce bounds and `slouch_seconds <= tracked_seconds` with database constraints as well as API validation. If `ended` is stored alongside state, enforce their consistency.

### Device registration

The scaffold uses one server-configured demo profile. The hosted target replaces it with an authenticated account and server-derived ownership; every read, summary, and mutation must be scoped accordingly. Device identity remains an opaque identifier, not a credential. The trusted MVP uses first authenticated HTTP claim for unused IDs under decision 018, without possession proof. Existing owners and legacy unowned history are protected. Before untrusted public rollout, replace first-claim enrollment with a verified binding or possession-proof flow. See [data-storage.md](data-storage.md).

Explicitly do **not** derive an "upright time" field from `tracked_seconds - slouch_seconds`. Label it in code, API responses, and UI copy as *device-classified non-slouch time* — the device isn't asserting clinically correct posture, only "not currently in a detected slouch episode."

## Ingestion API

Exact route paths, HTTP methods, and JSON shapes are the concrete contract in [app-api.md](app-api.md) (owned by codex); this section describes the required *behavior* that contract must implement, so the two documents stay consistent without duplicating route strings in two places.

The request's `snapshot` object mirrors the BLE fields the browser already decoded; the complete request also includes separate observation metadata as specified in app-api.md:

```json
{
  "protocol_version": 1,
  "state": "upright",
  "sequence": 12,
  "tracked_seconds": 60,
  "slouch_seconds": 10,
  "episode_count": 2
}
```

Field validation before touching storage: `protocol_version` must equal `1`; `state` must be a known enum string; `sequence` is `1..4294967295`; durations/count are non-negative integers within their wire sizes; `slouch_seconds <= tracked_seconds`. Failures return the specific error codes in app-api.md without mutating storage. Session `0` is not persisted activity.

### Atomic compare-and-replace

Use the transaction, unique-index race retry, and row-locking approach specified in app-api.md. The ordered outcomes are:

- **Row doesn't exist yet:** create it (first snapshot for this session). Concurrent first-snapshot requests racing each other must not both succeed as independent inserts — resolve via a database uniqueness guarantee on `(device_id, device_session_id)` plus a retry, not by assuming request ordering.
- **Row exists, incoming `sequence` < stored:** stale replay. Disposition `stale`, no error — this is an expected retry/duplicate-delivery case, not a client bug.
- **Row exists, incoming `sequence` == stored:**
  - payload identical to all stored canonical fields, including protocol version: disposition `duplicate` (idempotent replay, harmless).
  - payload differs: disposition `conflict`, reject, log it — same revision number claiming two different states is a protocol violation worth surfacing, not silently resolving either way.
- **Row exists, session already `ended`:** disposition `ended`, reject — no further activity accepted once a session is closed by device telemetry.
- **Row exists, incoming `sequence` > stored, invariants hold (counters nondecreasing, `slouch_seconds <= tracked_seconds`):** disposition `accepted`; if the incoming `state` is `"ended"`, set `ended = true` as part of the same update.

Success echoes the disposition and stored session, including its canonical snapshot and observation metadata. Error responses include stored state when an existing session is involved. Use the exact response shapes in app-api.md. An old HTTP acknowledgment must not overwrite fresher BLE readings or clear a newer unsaved revision.

Given the read-only-BLE default above, there is no separate HTTP action that ends a session — the app cannot manufacture an "ended" state the firmware never sent. `ended = true` is set only when an ingested snapshot carries `state = "ended"`. A session the device never explicitly ends (crash, dead battery, lost final packet) stays open in the data model; see below for how that's surfaced rather than hidden.

## Read API (shapes needed by screens)

Route paths belong in app-api.md; the shapes and behavior needed:

- **Current session** — the latest posture session for the registered device (whether or not it has been marked ended), or an explicit empty response if none exist yet. Because sessions can only end via device telemetry, an "open" session here may just mean the device hasn't reported ending it — including one abandoned hours ago. Label this as *last-known session state*, never as proof of a live, currently-tracking device; liveness is judged separately from the browser's own connection/staleness state (Live session screen below), not from this endpoint.
- **Today** — tracked/slouch seconds and episode count summed across sessions whose `calendar_day` is today (today uses the authenticated account's configured timezone in the hosted target, or the server demo timezone in the local scaffold; neither accepts a per-request timezone override). Empty-but-explicit shape (zeros, not omitted fields) when nothing recorded yet, so the UI can render a real empty state rather than treating absence as an error.
- **Weekly history** — same aggregation, one row per of the last 7 `calendar_day` values fixed relative to the profile's timezone, including days with no sessions (explicit zero rows, not gaps the frontend has to infer). Not an arbitrary date-range query in v1.

All three are computed by querying on read (no background aggregation job) — session count per device is small enough for v1 that a job or cache layer is premature. Revisit only if a concrete screen's latency becomes a problem in testing.

No websockets for v1: the browser already holds the live BLE connection and is the freshest source for the "current" view while connected; these endpoints exist for persistence and for reload/history, not for live push. Add websockets/ActionCable only if a demo scenario needs a second screen mirroring the first live.

## Ownership and pairing scope

The target is hosted Rails with Tiger Cloud and authenticated per-user storage, as proposed in [data-storage.md](data-storage.md). This replaces the earlier local-only target. The current no-login scaffold remains restricted to local development until account authentication, possession-verified device enrollment, user-scoped queries, HTTPS, and database TLS are implemented and tested. Keep same-origin requests and Rails CSRF protection. Users need no database installation; browsers keep only live state and pending uploads.

## Connection, saving, and calendar behavior

Keep Bluetooth status, device posture, and saving status separate. The app can show live posture while Rails is temporarily unavailable, with a visible unsaved indicator. Follow app-api.md's one-request upload queue, cumulative snapshot coalescing, bounded retries, and preservation of terminal snapshots. The proposed queue is in memory: reloading can lose unsaved records, and reconnecting recovers only data still retained by the ESP32. Durable offline history is not promised by this app-only plan.

First-seen-date grouping is the provisional calendar policy. Today and weekly summaries must say they group **sessions by first-seen date**. A session first observed late or spanning midnight cannot be split accurately with the current payload. Genuine per-day accounting requires firmware time-bucketed records and a synchronization extension. The full API defines timestamps and the frozen bucket rule.

## Screens / journeys

1. **Connect** — "Connect wearable" button (user-gesture-gated per Web Bluetooth requirements in ble-protocol.md), connection status (disconnected / connecting / connected), and errors surfaced from failed pairing.
2. **Live session** — show idle/calibrating/upright/slouching/sensor error/ended from device telemetry, and mark stale after three seconds without a fresh revision. Only connect/disconnect controls in the provisional default. Upload snapshots through the coalescing queue; show protocol errors and saving failures separately. On reload show saved data as last-known until a fresh BLE reading arrives. A future command extension would add pending/success/failure states before introducing start/end/calibrate buttons.
3. **Today** — tracked duration, device-classified non-slouch time, slouch duration, episode count; empty state before any session exists today.
4. **Weekly history** — 7-day view from `GET /api/v1/weekly`; explicitly label any non-today day with zero sessions as "no data," not zero activity.
5. **Daily challenge** — propose tracking 20 minutes for 50 points, with one completion per first-seen date. Derive progress and reward from stored totals so repeated uploads cannot grant extra points. Show a progress bar and completion state; no leaderboard or complex streak system. This concrete mechanic remains a product proposal (MVP.md open decision 7).

## Delivery milestones

1. **Decision pass** — confirm supporting Rails stack, hosted account/enrollment design and Tiger Cloud region/tier, retention and vetted versions, device-side controls, first-seen-date grouping versus true daily records, and challenge mechanic. Freeze the accepted API version. This planning task does not authorize scaffolding.
2. **Rails persistence and hosted API** — resolve scaffold review findings, add account ownership and authorized registration, then integrate atomic session/history writes with the Tiger Data rollout in [data-storage.md](data-storage.md). Preserve Device/PostureSession models, reconciliation, and read summaries. Exit when request tests cover duplicate/conflict/regression/ended cases, concurrent first insert, numeric bounds, and timezone grouping. Use synthetic HTTP fixtures matching the BLE example.
3. **Browser transport and saving** — pure byte decoder, deterministic fixture adapter, actual BLE adapter, and upload queue. Exit when ordering, reconnect, failed uploads, newer-in-flight snapshots, tab resume, and unsupported-browser states pass checks; verify BLE on an actual laptop separately.
4. **Dashboard** — live/last-known state, saved versus unsaved feedback, Today and Weekly views, textual chart alternatives, empty states, and mobile/laptop layouts. Exit when reload, no-data days, partial sessions, and weighted summaries display correctly.
5. **Challenge and integration** — implement the agreed reward rule, test exact threshold and duplicate-upload behavior, then rehearse: connect → device calibration/start → upright → sustained slouch → recover → device end → saved history after reload. Include a disconnect/reconnect trial and a visible saving failure.

Suggested app work split for the four-person team: Rails ingestion/data; browser BLE/sync; responsive interface/charts; test fixtures/integration/demo. Assign named owners later; shared contract fixtures connect the workstreams.

The scaffold uses Rails Minitest for model/request/query tests; choose the JavaScript test runner when build tooling is agreed. Run concurrency and hypertable checks on an isolated database matching the chosen production engine and vetted extension version, never the live user database. No coverage percentage is established; verify runtime prerequisites before claiming tests pass. Hardware transport checks remain distinct from simulated tests. Record actual run commands and setup in README.md during implementation. No build deadline is set; milestones express dependencies, not dates.
