# App API proposal

**Status: proposed v1; no endpoints are implemented.** This is the exact app-side contract for [APP_PLAN.md](APP_PLAN.md). The ESP32 uses [BLE telemetry](ble-protocol.md), not HTTP: the browser reads its identity and snapshots, maps the state enum to a string, and sends JSON to Rails. Neither HTTP nor BLE v1 provides browser-issued calibration/start/end commands.

## Boundary and deployment assumptions

Provisional first deployment: one Rails process bound to laptop loopback, one server-configured demo profile and IANA timezone, one wearable worn by one person. Multiple registered devices are for replacement/testing, not concurrent wear; overlapping sessions from different devices must be flagged before interpreting their sum as personal tracked time. No client-supplied profile or owner IDs are accepted.

The browser and Rails share an origin. Mutations send `Content-Type: application/json`, the Rails CSRF token, and same-origin cookies. Keep Rails request-forgery protection; device identity alone grants no ownership. Do not expose the no-login demo on a public/LAN interface. Hosting or separate wearer accounts requires a chosen authentication and authorization model first. [Rails security guide](https://guides.rubyonrails.org/security.html)

All API responses are JSON and use `Cache-Control: no-store`. Parse integers strictly: floats, numeric strings, booleans, nulls, and out-of-range values are invalid. Reject unknown request fields in v1 so contract drift is visible. Enforce an 8 KiB request-body limit. Dates below are ISO dates; timestamps are RFC 3339 instants with an explicit offset, stored as UTC.

## Routes

| Method and path | Purpose | Success |
| --- | --- | --- |
| `POST /api/v1/devices` | Register a BLE identity in the demo profile | `201` created; `200` existing |
| `GET /api/v1/devices` | List registered devices for reload/reconnect UI | `200` |
| `PUT /api/v1/devices/:device_id/sessions/:device_session_id/snapshot` | Create or reconcile the latest cumulative snapshot | `200` with disposition |
| `GET /api/v1/devices/:device_id/session` | Read the last-known session for this device | `200`, session may be null |
| `GET /api/v1/today` | Summary and challenge for the configured profile's current date | `200`, explicit empty shape |
| `GET /api/v1/weekly` | Seven consecutive dates ending today in the configured timezone | `200`, exactly seven rows |

Path `device_id` is exactly 32 lowercase hex characters decoded from the 16-byte identity. `device_session_id` is a decimal integer from `1` through `4294967295`. It is the firmware session ID, not the Rails row ID. Unknown registered devices return `404`; snapshot ingestion never implicitly registers one. Session `0` is browser-only idle state, never activity.

## Register and list devices

After reading identity, register explicitly:

```json
{"device_id":"00112233445566778899aabbccddeeff"}
```

The response is `{"device":{"device_id":"00112233445566778899aabbccddeeff"}}`. Repeating registration for the same ID returns the same object and never erases data. List returns `{"devices":[{"device_id":"00112233445566778899aabbccddeeff"}]}` or an empty array. Device selection is not a Bluetooth connection; the user still needs the browser's permission flow.

## Ingest a snapshot

Example: `PUT /api/v1/devices/00112233445566778899aabbccddeeff/sessions/7/snapshot`

```json
{
  "snapshot": {
    "protocol_version": 1,
    "state": "upright",
    "sequence": 12,
    "tracked_seconds": 60,
    "slouch_seconds": 10,
    "episode_count": 2
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

On the first successful insert, freeze `first_observed_at`, configured timezone, and `calendar_day = first_observed_at in that timezone`. Store `first_received_at` separately using server time. Later observations never change the bucket, even if a new tab reports a different first observation. A uniqueness race means the first committed observation wins; do not claim it is the earliest observation across all browsers. A saved session's bucket does not move if configuration later changes.

This is **first-observed-date grouping**, not measured activity per calendar day. Label the chart “Sessions by first-seen date.” Unknown earlier sessions and cross-midnight splits remain unsolved until firmware provides time-bucketed history. The BLE proposal's “browser-observed start date” wording refers to this same approximation, not an actual start event.

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
      "state": "upright",
      "sequence": 12,
      "tracked_seconds": 60,
      "slouch_seconds": 10,
      "episode_count": 2
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

`disposition` is `accepted`, `duplicate`, or `stale`; `session` always reflects stored state read consistently within reconciliation. This is a persistence acknowledgment, not proof of a current Bluetooth connection. Do not replace fresher local telemetry with an older HTTP acknowledgment. An acknowledgment at revision N clears only pending revisions through N for that device/session.

Errors use `{"error":{"code":"snapshot_conflict","message":"This revision has different recorded values."},"session":{...}}`, with the same complete session shape when an existing authorized row is involved; omit `session` otherwise. No partial writes on error.

| Status | Cases | Browser action |
| --- | --- | --- |
| `400` | Malformed JSON or invalid path format | Show request error; do not retry unchanged |
| `403` | Failed CSRF/origin checks | Stop upload; refresh/re-establish app session |
| `404` | Device not registered | Register the connected identity, then retry |
| `409` | `snapshot_conflict`, `session_ended` | Stop automatic retries for that session and show error |
| `413` / `415` | Body too large / wrong content type | Correct request format |
| `422` | `invalid_snapshot`, `invalid_observation`, `counter_regression` | Show validation error; no unchanged retry |
| `429` / `5xx` / network error | Temporary failure | Retain pending values and back off; honor `Retry-After` |

## Browser adapter and synchronization

1. On a click, discover the advertised service; read and validate identity; register it with Rails. If Rails is unavailable, live display may proceed with an explicit unsaved state and registration retry.
2. Subscribe, then read the cached snapshot. Decode the exact 20-byte format; reject invalid versions/states. Validate by session and revision so a late read cannot overwrite a newer notification. Serialize GATT operations and attach handlers to the active connection generation.
3. Live status uses BLE only: unsupported, disconnected, connecting, connected, or stale; posture state is a separate value. No new revision for three seconds means stale. Sensor error is distinct from a connection failure. On tab resume, mark live status unknown until a fresh read/heartbeat succeeds.
4. Keep the latest unsaved cumulative snapshot per session in memory, preserving each session's first-observed time. Send at most one HTTP request at a time, coalescing during a one-second upload interval. Terminal snapshots are queued immediately after any in-flight request.
5. On temporary HTTP failure retry after 1, 2, 4, 8, then at most 30 seconds with jitter. Bluetooth can remain live while saving is offline. Do not treat an older response as confirmation of a newer pending revision.
6. Preserve terminal snapshots for previous sessions while a new session starts. Bound the queue to 100 sessions; if full, show a blocking unsaved-data warning before accepting another session into the app queue. Never silently evict records. This cannot stop device tracking under read-only BLE.
7. Disconnect tears down listeners but does not end device tracking or clear unsaved records. Page closure/reload loses this provisional in-memory queue. Show an unsaved indicator; a browser unload prompt is best-effort only. Reconnection recovers only snapshots the device still retains. Durable browser outbox/device history are separate scope upgrades.

Use a transport interface (`connect`, `disconnect`, `onSnapshot`, `onStatus`) with real BLE and deterministic fixture adapters. Fixtures must be visibly labeled and use separate demo records so testing cannot contaminate actual history. No raw-angle processing in either adapter.

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
    "tracked_seconds": 60,
    "slouch_seconds": 10,
    "non_slouch_seconds": 50,
    "episode_count": 2,
    "non_slouch_percent": 83.33
  },
  "challenge": {
    "id": "track_20_minutes",
    "target_seconds": 1200,
    "progress_seconds": 60,
    "completed": false,
    "earned_points": 0
  }
}
```

The proposed challenge awards 50 points once per date when tracked seconds reach 1200; derive it from saved totals rather than incrementing points on uploads. Cap progress at 1200. This mechanic is a proposal pending product confirmation. Incomplete session totals count as observed partial activity and remain labeled incomplete.

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
- Retry on the next day does not move an existing session's bucket; UTC-to-profile-timezone and midnight examples match chart labels.
- Two sessions of 60/10 and 120/60 tracked/slouch seconds produce 180 tracked, 70 slouch, 110 non-slouch, and 61.11%, not the mean of their percentages.
- Empty dates, partial sessions, challenge threshold, and repeated uploads behave consistently without inventing observations or extra rewards.

These are planned tests, not existing test results. Offline all-day history, public hosting/authentication, device commands, and the final calendar policy still require team decisions before implementation.
