# App API contract

**Status: current Rails v1 API, reviewed against source on 2026-09-26; browser integration is implemented; physical device validation remains pending.** The [hardware integration plan](hardware-integration-plan.md) connects the existing firmware to these endpoints. The ESP32 uses [BLE telemetry](ble-protocol.md), not HTTP. The browser reads device identity and calculated snapshots, maps enum states to strings, and forwards them unchanged. Neither protocol defines browser-issued calibration/start/end commands.

## Current deployment and ownership

The immediate target is an authenticated local demo under [decision 015](decisions/015-local-mvp-demo.md). Username/password login uses Rails cookie sessions; unused devices register to the signed-in account on first upload preflight under [decision 018](decisions/018-mvp-first-connection-registration.md). See [account setup](authentication-mvp.md). All data endpoints require authentication (`401`); unknown/non-owned devices return `404` on reads/uploads. Registration claims unused identities or empty unowned rows, and acknowledges same-owner retries (`200`). Other-owned devices and unowned legacy history return `404` on registration.

Mutations send `Content-Type: application/json`, `X-CSRF-Token` from the rendered Rails page, and same-origin cookies. Keep request-forgery protection. Login/signup are browser form flows, not JSON endpoints in this API. A BLE device ID is public identity, not an ownership credential. No client-supplied user ID is accepted. The current `users` table has no timezone field: personal summaries and ingestion use configured `DEMO_TIMEZONE` (default `America/New_York`), with each session's calendar metadata frozen on creation. Weekly group rankings use the separate Monday–Sunday rules in [decision 014](decisions/014-weekly-competition-implementation-defaults.md).

Canonical sessions and accepted-revision history are already written atomically by `Snapshots::Ingest`. Local PostgreSQL stores history as an ordinary table; explicitly configured Timescale targets support hypertables. Hosted deployment, possession-proof enrollment, retention, and operations remain separate [storage-plan](data-storage.md) work. No new Rails schema or endpoint is proposed for the current hardware payload. Multiple devices per user support replacement/testing; summed overlapping sessions are not de-overlapped personal exposure.

## Request and response rules

Controller API responses are JSON with `Cache-Control: no-store`. Parse integers strictly: floats, numeric strings, booleans, nulls, and out-of-range values are invalid. Unknown fields are rejected. The middleware enforces an 8 KiB request-body limit before JSON decoding, including CSRF parameter access and request logging; oversized bodies return `413` even when malformed. JSON media-type parameters such as `charset=utf-8` are accepted. Dates below are ISO dates; timestamps are RFC 3339 instants with an explicit offset, stored as UTC.

Malformed path segments can fail route constraints before reaching a controller and return a routing `404`, potentially non-JSON. A client must check status/content type before parsing, and must not interpret every `404` as a device enrollment problem. Controller-reachable invalid paths return structured `400 invalid_path`. Error precedence also depends on authentication, CSRF, content type, and the body-size middleware; examples assume a valid authenticated request unless stated otherwise.

## Routes

| Method and path | Purpose | Success |
| --- | --- | --- |
| `POST /api/v1/devices` | Register an unused BLE identity to this account, or acknowledge its existing ownership | `200` |
| `GET /api/v1/devices` | List registered devices for reload/reconnect UI | `200` |
| `PUT /api/v1/devices/:device_id/sessions/:device_session_id/snapshot` | Create or reconcile the latest cumulative snapshot | `200` with disposition |
| `GET /api/v1/devices/:device_id/session` | Read the last-known session for this device | `200`, session may be null |
| `GET /api/v1/today` | Summary and challenge for the configured app timezone's current date | `200`, explicit empty shape |
| `GET /api/v1/weekly` | Seven consecutive dates ending today in the configured timezone | `200`, exactly seven rows |

Path `device_id` is exactly 32 lowercase hex characters decoded from the 16-byte identity. `device_session_id` is a decimal integer from `1` through `4294967295`. It is the firmware session ID, not the Rails row ID. Unknown or non-owned devices return `404`; snapshot ingestion never implicitly registers one. Session `0` is browser-only pre-session status, including `idle` or boot-time `sensor_error`, never persisted activity.

## Register and list devices

After reading the exact 16-byte identity, register it to the signed-in account or acknowledge its existing ownership on first positive-session upload:

```json
{"device_id":"00112233445566778899aabbccddeeff"}
```

The response is `{"device":{"device_id":"00112233445566778899aabbccddeeff"}}`. Repeating acknowledgement for an owned ID returns the same object and never erases data. A `404 device_not_found` means the identity is unavailable to this account (another owner or legacy unowned history); repeated POSTs cannot transfer it. Registration is trust on first HTTP claim, not proof of possession. Owner/history details are not disclosed; unused identity availability is observable. List returns `{"devices":[{"device_id":"00112233445566778899aabbccddeeff"}]}` or an empty array. Device selection is not a Bluetooth connection; the user still needs the browser's permission flow.

## Ingest a snapshot

Example: `PUT /api/v1/devices/00112233445566778899aabbccddeeff/sessions/7/snapshot`

```json
{
  "snapshot": {
    "protocol_version": 1,
    "state": "slouching",
    "sequence": 181,
    "tracked_seconds": 180,
    "slouch_seconds": 70,
    "episode_count": 1
  },
  "observation": {
    "first_observed_at": "2026-09-26T02:00:00Z"
  }
}
```

| Snapshot field | Validation |
| --- | --- |
| `protocol_version` | Integer `1` |
| `state` | `idle`, `calibrating`, `upright`, `slouching`, `sensor_error`, or `ended`; BLE codes `0`–`5` map in this order |
| `sequence` | Integer `1..4294967295` |
| `tracked_seconds` | Integer `0..4294967295` |
| `slouch_seconds` | Integer `0..4294967295`, no greater than tracked seconds |
| `episode_count` | Integer `0..65535` |

The observation object is required. `first_observed_at` is the browser's first observation of this device/session, retained across retries in that tab. It is not the wearable's start timestamp. Validate the timestamp and reject values more than five minutes in the server's future as a clock error. Do not derive start time by subtracting tracked seconds: calibration and unclassified gaps are excluded from that counter.

On the first successful insert, freeze `first_observed_at`, configured app timezone, and `calendar_day = first_observed_at in that timezone`. Store `first_received_at` separately using server time. Later observations never change the bucket, even if a new tab reports a different first observation. A uniqueness race means the first committed observation wins; do not claim it is the earliest observation across all browsers. A saved session's bucket does not move if configuration later changes.

This is **first-observed-date grouping**, not measured activity per calendar day. Label the chart “Sessions by first-seen date.” Unknown earlier sessions and cross-midnight splits remain unsolved until firmware provides time-bucketed history. Older documents call this “browser-observed start date”; it is the same approximation, not an actual start event.

## Atomic reconciliation and acknowledgments

Validate shape/ranges, then resolve the device and reconcile in a database transaction. Enforce a unique index on `(device_id, device_session_id)` plus row locking for existing sessions. If simultaneous inserts hit that index, retry the whole transaction and compare against the winner; do not continue inside an aborted transaction. Model-level uniqueness validation alone is insufficient. [Rails uniqueness validation](https://guides.rubyonrails.org/active_record_validations.html#uniqueness), [Rails row locking](https://api.rubyonrails.org/classes/ActiveRecord/Locking/Pessimistic.html)

Apply these branches in order:

1. No row: create it using the snapshot, set `ended` from `state == "ended"`, and freeze observation metadata. Return `accepted`.
2. Incoming sequence lower: return `stale`, with no mutation.
3. Equal sequence: compare **all six canonical snapshot fields**, including protocol version. If identical, return `duplicate`; if different, return `409 snapshot_conflict`.
4. Higher sequence on an ended row: return `409 session_ended`.
5. Higher sequence with any cumulative counter lower than stored: return `422 counter_regression`.
6. Otherwise atomically replace canonical fields, set `ended` from telemetry, and advance `last_received_at`. Return `accepted`.

An identical retry of an ended snapshot is therefore a successful duplicate, not a failure. Stale retries do not reopen ended sessions. Never modify firmware state to resolve a server error. `last_received_at` advances only on an accepted revision, so repeated retries cannot make old data appear fresh.

Success is always `200`, including first insertion:

```json
{
  "disposition": "accepted",
  "session": {
    "device_id": "00112233445566778899aabbccddeeff",
    "device_session_id": 7,
    "snapshot": {
      "protocol_version": 1,
      "state": "slouching",
      "sequence": 181,
      "tracked_seconds": 180,
      "slouch_seconds": 70,
      "episode_count": 1
    },
    "ended": false,
    "first_observed_at": "2026-09-26T02:00:00Z",
    "first_received_at": "2026-09-26T02:00:01Z",
    "last_received_at": "2026-09-26T02:00:01Z",
    "calendar_day": "2026-09-25",
    "calendar_timezone": "America/New_York"
  }
}
```

`disposition` is `accepted`, `duplicate`, or `stale`; `session` always reflects stored state read consistently within reconciliation. This is a persistence acknowledgment, not proof of a current Bluetooth connection. Do not replace fresher local telemetry with an older HTTP acknowledgment. A `stale` acknowledgment describes server state, not proof that a conflicting lower local measurement was accepted; compare returned identity, session, revision, and counters before clearing pending data. An acknowledgment at revision N clears only pending revisions through N for that device/session.

Errors use `{"error":{"code":"snapshot_conflict","message":"This revision has different recorded values."},"session":{...}}`, with the same complete session shape when an existing authorized row is involved; omit `session` otherwise. No partial writes on error.

| Status | Cases | Browser action |
| --- | --- | --- |
| `400` | Malformed JSON or invalid path format | Show request error; do not retry unchanged |
| `401` | Missing/expired login | Pause uploads; reauthenticate as the same account before resuming |
| `403` | Failed CSRF/origin checks | Stop upload; refresh/re-establish app session |
| `404` | `device_not_found`: unavailable registration, unknown/non-owned read/upload; or unmatched route | For structured device error, use the original account or another wearable; for routing/non-JSON error, fix the request. Do not transfer ownership or blindly retry |
| `409` | `snapshot_conflict`, `session_ended` | Stop automatic retries; apply the narrowly defined terminal-heartbeat reconciliation below for `session_ended` only |
| `413` / `415` | Body too large / wrong content type | Correct request format |
| `422` | `invalid_snapshot`, `invalid_observation`, `counter_regression` | Show validation error; no unchanged retry |
| `429` / `5xx` / network error | Temporary failure | Retain pending values and back off; honor `Retry-After` |

## Browser adapter and synchronization

1. On a click, discover the advertised service; read and validate identity; register its identity with Rails on first positive-session upload. If Rails is temporarily unavailable, live display may proceed with an explicit unsaved state and bounded retry. Bind the queue to the logged-in account, and pause saving on `401`, `403`, or a missing binding.
2. Subscribe, then read the cached snapshot. Decode the exact 20-byte format; reject invalid versions/states. Validate by session and revision so a late read cannot overwrite a newer notification. Serialize GATT operations and attach handlers to the active connection generation.
3. Live status uses BLE only: unsupported, disconnected, connecting, connected, or stale; posture state is a separate value. No new valid revision for three seconds means stale while tracking. A held BOOT button may cause this without a disconnect. Ended status is terminal; display link/liveness separately and never imply continued tracking. Sensor error is distinct from a connection failure. On tab resume, mark live status unknown until a fresh read/heartbeat succeeds.
4. Keep the latest unsaved cumulative snapshot per session in memory, preserving each session's first-observed time. Send at most one upload/preflight request at a time, coalescing during a one-second upload interval. Terminal snapshots are queued immediately after any in-flight request.
5. On temporary HTTP failure retry after 1, 2, 4, 8, then at most 30 seconds with jitter. Bluetooth can remain live while saving is offline. Do not treat an older response as confirmation of a newer pending revision.
6. Preserve the latest unsaved snapshot for every previous session, including nonterminal sessions lost on a reboot, while a new session starts. Bound the queue to 100 sessions; if full, show a blocking unsaved-data warning before accepting another session into the app queue. Never silently evict records. This cannot stop device tracking under read-only BLE.
7. Disconnect tears down listeners but does not end device tracking or clear unsaved records. Page closure/reload loses this provisional in-memory queue. Show an unsaved indicator; a browser unload prompt is best-effort only. Reconnection recovers only snapshots the device still retains. Durable browser outbox/device history are separate scope upgrades.

Use a transport interface (`connect`, `disconnect`, `onSnapshot`, `onStatus`) with real BLE and deterministic fixture adapters. Fixtures must be visibly labeled and use separate demo records so testing cannot contaminate actual history. No raw-angle processing in either adapter. The fixture adapter must use an isolated test/demo account and device namespace; the production path cannot silently enable fixtures.

### Adaptation to the current firmware

[Decision 016](decisions/016-integrate-existing-hardware.md) makes the checked-in firmware the integration baseline. These rules are implemented by `app/javascript/ble/` and the Stimulus device controller:

- Current firmware qualifies at 10 seconds, credits the full candidate once, counts one episode, and stops after 3 continuous upright seconds (including recovery time). Shorter leans contribute nothing. See [decision 017](decisions/017-ten-second-slouch-grace.md). Transport the measured values unchanged; do not run another browser timer or reinterpret old-firmware counters.
- Display session `0` diagnostics but do not enqueue them. The first BOOT calibration allocates a positive session; recalibration retains that session's counters. Reboot returns to session `0`; the next calibration normally allocates a higher session ID. Scope sequence ordering to `(device_id, session_id)`, with a connection-generation guard for old callbacks. Do not let a delayed older session replace the currently observed newer session.
- The device has no ordinary end action. Disconnect, stale readings, page closure, and reboot never synthesize `ended`. Save known totals and show the old session as incomplete. Power-off can lose unsaved totals. Same-session reconnect recovers the latest RAM counters; it cannot recover overwritten sessions.
- On the first `ended` snapshot, latch its exact payload/revision and retry that immutable snapshot until acknowledged. Later firmware heartbeats with the same session, version, terminal state, and counters but a higher sequence are transport liveness only: suppress their uploads. A state/counter change after ended is a protocol error. No fabricated revision or rewritten counter is permitted.
- Before uploading after reconnect/reload, read the server's latest session. If its key matches the observed session and it is already ended with identical version/state/counters, treat those totals as saved and suppress the redundant terminal upload. If another tab wins a terminal-save race, a `409 session_ended` includes authorized stored state: apply the same exact key/version/state/counter comparison and stop retrying only if it matches. Otherwise surface an error. The latest-session endpoint cannot fetch older sessions; an older queued session uses its PUT response for reconciliation. Do not loosen Rails' ended-session rule.
- Ignore lower revisions as stale (they may be delayed packets); do not treat every lower sequence as proof of a reboot. A newer revision with regressing counters, equal-revision conflicts, or evidence of reused identity/session IDs must stop saving that session with a protocol error. An apparent sequence wrap cannot be distinguished reliably from old data from sequence alone; keep it stale/unsaved and require operator diagnosis. Do not guess a new identity, offset, session number, or wrap epoch. Firmware persistence failures and overflow are documented limits, not permission to fabricate measurements.
- Capture `first_observed_at` once when the browser first sees a positive session, before network requests. Preserve it during coalescing/retry/reconnect in that tab; never calculate it as current time minus tracked time.
- On logout, stop the transport and uploader, invalidate pending callbacks, and visibly resolve/discard unsaved data according to the user's choice before account switching. A queue created under account A must never resume under account B, even if a request was in flight when the cookie changed. On expired login, retain only an account-bound paused queue until the same account reauthenticates. The controller binds its lifetime to the rendered account ID, invalidates callbacks on exit, and listens for cross-tab account changes; no bearer token is added to the BLE protocol.

### Realistic cross-layer fixture

Identity bytes `00 11 22 33 44 55 66 77 88 99 aa bb cc dd ee ff` produce `00112233445566778899aabbccddeeff`. This 20-byte snapshot maps to the request above (session `7`, revision `181`, slouching, `180` tracked seconds, `70` slouch seconds, `1` episode):

```text
01 03 07 00 00 00 b5 00 00 00 b4 00 00 00 46 00 00 00 01 00
```

The old `60/10/2 episodes` fixture in [BLE decoding checks](ble-protocol.md#review-fixtures-and-verification) is a synthetic range/layout test only; it is not reachable as qualified episode history in this firmware.

## Read responses and summary semantics

`GET /devices/:device_id/session` under `/api/v1` returns `{"session":null}` before any session, otherwise the full session object above. Choose the greatest `device_session_id` for this persistent identity, not the most recently received packet; an old session arriving late must not become “current.” This is last-known state, including ended or incomplete sessions, never live status.

`GET /api/v1/today` returns this example for the configured date:

```json
{
  "date": "2026-09-25",
  "timezone": "America/New_York",
  "grouping": "first_observed_date",
  "summary": {
    "session_count": 1,
    "incomplete_session_count": 1,
    "tracked_seconds": 180,
    "slouch_seconds": 70,
    "non_slouch_seconds": 110,
    "episode_count": 1,
    "non_slouch_percent": 61.11
  },
  "challenge": {
    "id": "track_20_minutes",
    "target_seconds": 1200,
    "progress_seconds": 180,
    "completed": false,
    "earned_points": 0
  }
}
```

The existing legacy `ChallengeQuery` returns 50 derived points per date when tracked seconds reach 1200; derive it from saved totals rather than incrementing points on uploads. Cap progress at 1200. This legacy API field is not the group scoring rule or a newly approved reward; the saved dashboard uses the competition decisions instead. Incomplete session totals count as observed partial activity and remain labeled incomplete.

Sum counters once per session, not once per snapshot. `non_slouch_seconds = tracked_seconds - slouch_seconds`; percentage is `100 * sum(non_slouch_seconds) / sum(tracked_seconds)`, rounded to two decimals. Never average per-session percentages. It describes device-classified non-slouch time, not medically correct posture.

An empty summary has zero counts/durations, `non_slouch_percent: null`, and zero challenge progress. No-data dates must not appear as 100% upright or as measured zero activity. A zero-duration session is distinguishable by `session_count > 0`.

`GET /api/v1/weekly` returns `{"timezone":"America/New_York","grouping":"first_observed_date","days":[...]}`. Each of exactly seven oldest-to-newest entries is `{"date":"YYYY-MM-DD","summary":{...}}` using the same summary shape. End on today; use calendar arithmetic in the configured timezone across daylight-saving transitions. No arbitrary date or timezone query parameters in v1.

## Required contract checks before implementation is accepted

- BLE fixture decodes to the sample request; encode/decode field ranges match, including uint32 values above signed-int maximum.
- Two first inserts for the same identity/session leave one row and the greatest valid revision.
- Equal identical snapshots succeed; equal conflicting snapshots and regressing counters do not mutate rows.
- An ended snapshot can be retried; a higher revision cannot reopen it.
- Revision 13 arriving while revision 12 uploads remains pending after the revision-12 acknowledgment.
- BLE disconnect, HTTP failure, tab suspension, reload, and unregistered identity produce distinct, truthful UI states.
- Retry on the next day does not move an existing session's bucket; UTC-to-configured-timezone and midnight examples match chart labels.
- Two sessions of 60/10 and 120/60 tracked/slouch seconds produce 180 tracked, 70 slouch, 110 non-slouch, and 61.11%, not the mean of their percentages.
- Empty dates, partial sessions, challenge threshold, and repeated uploads behave consistently without inventing observations or extra rewards.

These are the contract acceptance requirements. Implementation tests and current limitations are recorded in [local demo verification](local-demo.md#browser-ble-integration). Direct review covered models, schema, migrations, controllers, queries, and the atomic ingestion service. No generated model-map tasks exist. The current first-seen grouping and physical controls are documented limitations; true daily history and browser commands remain separate extensions. Public deployment still requires the operational/enrollment gates in [data-storage.md](data-storage.md).
