# Hardware integration plan

**Status: browser integration implemented under the subsequent operator assignment; physical hardware acceptance pending.** This closes the gap identified in [ROADMAP.md](ROADMAP.md) Phase 2/4: firmware and the Rails API already exist; the browser adapter now connects their existing contracts. The companion [BLE contract](ble-protocol.md) and [HTTP API](app-api.md) distinguish current source behavior from proposed browser handling. The original documentation plan followed [decision 016](decisions/016-integrate-existing-hardware.md); the operator subsequently authorized Codex implementation with Claude review.

## What the hardware actually provides (verified against firmware)

Read directly from [the detector sketch](../Hardware/slouch_detector/slouch_detector.ino). This is the only BLE publisher; [read_all_data](../Hardware/read_all_data/read_all_data.ino) and [i2c_scanner](../Hardware/i2c_scanner/i2c_scanner.ino) are serial diagnostics. Git tracks one `Hardware/` directory; on this case-insensitive workspace, lowercase `hardware/` refers to the same directory, not a duplicate.

| Contract item | Original BLE draft | slouch_detector.ino (actual) | Match |
| --- | --- | --- | --- |
| Service UUID | `caa153e1-8bec-412c-a7ea-570bf12cbd13` | same (`SERVICE_UUID`, line 40) | yes |
| Identity characteristic | `5a02ab16-...`, read, 16 opaque bytes | same (`IDENTITY_UUID`), `esp_fill_random` into flash-persisted `deviceId[16]` | yes |
| Snapshot characteristic | `3ea72a7d-...`, read+notify, 20 bytes LE | same (`SNAPSHOT_UUID`), `publish()` builds the exact 20-byte layout | yes |
| Protocol version | `1` | `PROTOCOL_VERSION = 1` | yes |
| States `0`–`5` | idle/calibrating/upright/slouching/sensor_error/ended | identical enum order (`STATE_IDLE`..`STATE_ENDED`) | yes |
| Publish cadence | ~1/s plus state-change | `PUBLISH_MS = 1000`, plus immediate publish on `stateChanged` | yes |
| Session allocation | new nonzero session before start, sequence starts at 1, no reuse on reboot | `allocateSession()` persists an incrementing counter in `Preferences`; `sessionId` resets to 0 only in RAM, so next calibration normally allocates a new ID; unchecked writes/wrap limit durability | source intent; verify persistence |
| Episode qualification | >60s continuous slouch, once per episode | `EPISODE_MS = 60000`; first new lean resets the latch, sensor error/calibration clears detection | yes in source |
| Counter overflow | never wrap | Only episode overflow is guarded; sequence, session ID, and duration conversion can wrap; flash writes unchecked | limitation |
| Calibration/start/end trigger | **unresolved** in the proposal (physical vs. BLE write) | resolved in firmware: **physical BOOT button only** (`CAL_BUTTON`, GPIO 0). There is no write characteristic. Ending a session is not exposed at all — firmware never sets `STATE_ENDED` except on counter overflow | now answered, but incomplete |

There is no browser start/end characteristic and no ordinary physical end action. BOOT starts or recalibrates; powering off loses the RAM session rather than publishing a clean end. The app must preserve saved partial totals and mark sessions incomplete. Record this current control behavior without claiming the hardware has been physically validated.

Per the operator's steer: the app must mold to what the hardware actually does, not the other way around. The items below are documented adapter/API behavior to build against, not a request to change firmware first.

### Firmware edge cases the adapter and API doc must account for (verified by reading the source, not proposed hardening)

- **Session 0 can carry `sensor_error`.** If the BNO055 fails `bno.begin()` at boot, `setup()` sets `state = STATE_SENSOR_ERROR` while `sessionId` is still `0` and immediately publishes it. The adapter must be able to display this pre-session status (idle or sensor error), but must never `PUT` a snapshot for session `0` — it is browser-only pre-session status per app-api.md, not an activity session.
- **A calibration-time sensor dropout can produce a low-sample baseline after an arbitrary delay.** `updateCalibration()` simply returns while the sensor doesn't answer (`!ok`), so an outage extends how long calibration takes without resetting the intended sample window; once the sensor returns, it can finish with very few (even a single) sample if the elapsed wall clock already exceeds `SETTLE_MS + CALIBRATE_MS`. Treat the "upright baseline" as approximate, not guaranteed high-sample-count, in any UI copy.
- **`sensorOk()` only proves the chip is in IMU mode, not that every subsequent Euler read is valid.** It checks one register, not the read that follows. Do not surface counter/state values as more trustworthy than the firmware itself claims.
- **Holding BOOT blocks the loop.** `while (digitalRead(CAL_BUTTON) == LOW) delay(10);` stalls the whole sketch, so no BLE heartbeat is published while the button is held. A held button can make the browser's 3-second stale threshold fire even though the device is fine — don't treat "stale" as necessarily meaning disconnected or malfunctioning.
- **Sensor recovery reuses the existing baseline.** After a mid-session BNO055 dropout and recovery, `classify()` resumes with the same `baseline` rather than recalibrating. This is existing behavior, not a bug to fix here — the adapter should not assume a recovery implies a fresh calibration.
- **The LED alert's 3-second recovery does not debounce episode continuity.** `leaning` flips to `false` the instant the angle crosses back above threshold, with no grace period, even though the LED alert itself waits `RECOVER_MS` before clearing; `leanStart`/`episodeCounted` are stale until the *next* lean re-arms them (`if (!leaning) { leaning = true; leanStart = now; episodeCounted = false; }`). Net effect is the same: a momentary upright blip restarts the episode timer from zero on the next lean, even while the LED stays lit. Don't infer episode-timer state from the LED/alert state.
- **`ended` heartbeats keep incrementing `sequence` with unchanged counters.** Once `STATE_ENDED` is set (episode-counter overflow), `loop()` still calls `publish()` on every heartbeat, and `sequence++` runs regardless of state. Naively uploading every new sequence would hit app-api.md's branch 4 (`409 session_ended`) forever. The adapter should latch the first observed terminal snapshot, upload/retry that one revision, and then suppress further terminal heartbeats for that session rather than repeatedly re-uploading and erroring. A state or counter change *after* `ended` is still a genuine protocol error and must surface as one, not be silently swallowed by the suppression rule.
- **On reload, check stored session state before uploading.** If `GET /api/v1/devices/:device_id/session` shows the same device/session as ended with matching version/state/counters, apply the same suppression above rather than re-sending a terminal snapshot that only produces `session_ended` conflicts.

### Fixture correction

The `01 02 07 00 00 00 0c 00 00 00 3c 00 00 00 0a 00 00 00 02 00` example (tracked 60s, slouch 10s, **2 episodes**) is byte-decode-only: it is not physically reachable under this firmware, since each qualifying episode requires *more than 60s* of continuous slouch (`EPISODE_MS`), so 2 episodes need at least ~120s of cumulative slouch time, not 10s. ble-protocol.md and app-api.md now keep it labeled as a layout-only decoder fixture and pair it with a physically realistic example — tracked `180`, slouch `70`, episodes `1` (one episode just over the 60s threshold, well under tracked time) — for anything adapter- or UI-facing. Don't let a UI screenshot or demo script use the impossible fixture.

### Routing gap

`config/routes.rb` constrains device and session path segments. A malformed path segment that does not match a route falls through to Rails' generic unmatched-route handling (a plain 404, not JSON), before ever reaching the controller's structured `400 invalid_path` response that app-api.md documents. The browser adapter should treat any non-JSON 404 on these paths the same as a routing/client bug, not as `device_not_found`; and the API doc should note this gap explicitly rather than imply the controller's `400` is the only malformed-path outcome.

## What the app side already provides (verified against code)

`app/controllers/api/v1/snapshots_controller.rb`, `devices_controller.rb`, `sessions_controller.rb`, `today_controller.rb`, and `weekly_controller.rb` already implement the [app-api.md](app-api.md) v1 contract: strict integer validation, the six-branch reconciliation (`accepted`/`stale`/`duplicate`/`409 snapshot_conflict`/`409 session_ended`/`422 counter_regression`), RFC 3339 + explicit-offset validation on `first_observed_at`, and admin-provisioned device ownership (`POST /api/v1/devices` acknowledges, never creates). This matches [authentication-mvp.md](authentication-mvp.md)'s "no public claim" model. **No new schema or endpoint appears necessary from source review.** Runtime and hardware acceptance are still required; existing code is not proof of a working physical integration.

The missing client path is now implemented: `ble/core.js` decodes/reconciles packets and queues uploads; `ble/bluetooth_transport.js` handles native GATT; `ble/account_context.js` signals account changes; and `controllers/device_controller.js` connects them to the dashboard. A server-gated `ble/fixture_transport.js` exercises the same path in the isolated browser tests. Physical verification remains a separate acceptance gate.

## API doc

Use the updated [app-api.md](app-api.md) for exact bodies, responses, error handling, provisioning, and terminal-heartbeat compatibility. It replaces historical no-login/201-registration text with current account-scoped behavior. Summary of the routes the browser adapter will call:

| Method and path | Purpose |
| --- | --- |
| `GET /api/v1/devices` | List this account's provisioned devices, to know which BLE identities to expect |
| `POST /api/v1/devices` | Acknowledge a provisioned device by ID (`{"device_id":"<32 hex>"}`) — `404` if not admin-provisioned |
| `PUT /api/v1/devices/:device_id/sessions/:device_session_id/snapshot` | Upload the current cumulative snapshot; body is `{"snapshot": {...6 fields}, "observation": {"first_observed_at": "<RFC3339>"}}` |
| `GET /api/v1/devices/:device_id/session` | Recover last-known session state on reload/reconnect |
| `GET /api/v1/today` / `GET /api/v1/weekly` | Dashboard summaries, unaffected by BLE and already implemented |

Given the "no browser-initiated end" finding above, the updated API contract requires: **the browser must treat `ended` purely as firmware-reported state**, never send it speculatively, and must not offer a "stop session" UI action that doesn't exist on the device.

## Integration plan (browser adapter)

Sequenced to close ROADMAP Phase 2 and the Phase 4 dashboard items, using the transport interface app-api.md already specifies (`connect`, `disconnect`, `onSnapshot`, `onStatus`).

1. **Decode/encode fixtures first.** Before writing the adapter, port both ble-protocol.md fixtures into JS unit tests: the layout-only decoder fixture (`01 02 07 00 00 00 0c 00 00 00 3c 00 00 00 0a 00 00 00 02 00` → session 7, sequence 12, tracked 60, slouch 10, episodes 2, state upright — byte-valid but not physically reachable) and the realistic API example (session 7, sequence 181, tracked 180, slouch 70, episode 1, state slouching) for anything adapter- or UI-facing. Add the rejection cases: bad version, unknown state, wrong length, `slouch_seconds > tracked_seconds`.
2. **`ble_transport.js` (real adapter).** Wraps `navigator.bluetooth.requestDevice({filters:[{services:[SERVICE_UUID]}]})`, reads identity, subscribes to the snapshot characteristic, decodes per the fixture format, and exposes `connect/disconnect/onSnapshot/onStatus`. Serialize GATT calls (one in flight at a time) and bind callbacks to a connection generation counter so a stale callback from a replaced connection is dropped, per app-api.md's ordering rules.
3. **`fixture_transport.js` (test adapter).** Same interface, replays a scripted sequence of snapshots with no real Bluetooth. Visibly labeled (e.g. a banner) and never shares storage keys with the real adapter, per app-api.md's fixture-contamination rule.
4. **`device_controller.js` (Stimulus).** UI glue: connect button → `transport.connect()` → on identity, `POST /api/v1/devices`; on `404`, show "ask an admin to provision this device" rather than retrying. On each snapshot, hand it to the sync module.
5. **Sync module.** One in-flight `PUT .../snapshot` at a time, coalesced on a 1s interval, exponential backoff (1/2/4/8/30s + jitter) on `429`/`5xx`/network errors, priority send for the first terminal (`ended`) snapshot after any in-flight request, per-session queue bounded to 100 with a blocking unsaved-data warning when full and no silent eviction. Map `disposition`/error codes to UI state per app-api.md's status table (`400`/`401`/`403`/`404`/`409`/`413`/`415`/`422` handled distinctly).
6. **Live status display (Phase 4).** BLE status (`unsupported`/`disconnected`/`connecting`/`connected`/`stale after 3s without a new revision`) shown separately from posture state, plus an "unsaved" indicator when the HTTP queue is behind BLE. On tab resume, mark live status unknown until a fresh read succeeds.
7. **Playwright coverage.** Extend `test/e2e` with the fixture transport (no real Bluetooth in CI): connect → snapshot arrives → dashboard updates → simulated HTTP failure shows unsaved state → recovery flushes the queue. Keep this in the same mobile/desktop project matrix as the existing suite (see [playwright-user-loop-plan.md](playwright-user-loop-plan.md)).
8. **Chrome verification.** Confirm Web Bluetooth actually works on the demo laptop/OS/Chrome combination (ROADMAP Phase 0 item, still open) before relying on step 2 in a live demo; Safari/Firefox have no Web Bluetooth support, so validate a supported Chrome setup rather than assuming every browser with a similar engine works. See [Chrome documentation](https://developer.chrome.com/docs/capabilities/bluetooth).

## Still open (unblock before or during implementation)

These are pre-existing ROADMAP/decision gaps this plan does not resolve on its own:

- Laptop/OS/Chrome combination for the demo — needs a real hardware test, not just code.
- Same-session reconnect recovery (re-reading the device's still-retained RAM counters after a dropped BLE link) is in scope and already described in ble-protocol.md/app-api.md. Durable multi-session/offline history — recovering sessions the device no longer retains after reboot/replacement, or surviving loss of the browser queue — is explicitly out of scope per app-api.md ("durable browser outbox... separate scope upgrade"); confirm the demo accepts that narrower guarantee.
- Calendar policy: this plan assumes the existing "browser-observed first-seen date" simplification from app-api.md; genuine per-day buckets need firmware changes first and are not part of this plan.
- Current physical control behavior is recorded in [decision 016](decisions/016-integrate-existing-hardware.md); adding commands or a normal end action is a future extension, not part of this browser plan.

## Acceptance checks for this plan

Reuses app-api.md's existing checklist (BLE fixture decode, duplicate/stale/conflict handling, revision races, empty/partial dates) plus:

- Fixture transport and real transport pass through the same Stimulus controller and sync module unmodified.
- Unknown and other-owned device bindings share the same privacy-preserving `404`; distinguish this from unsupported Bluetooth, expired login, and malformed routing without disclosing another owner.
- Blocking outbound requests (stopped local Rails server, simulated network failure, or an injected 5xx) mid-session shows "unsaved," and recovery flushes the queue without duplicate rows (verified via `disposition` in the response, not client-side dedup). Killing Wi-Fi specifically does not exercise this on a same-machine loopback demo, since the browser and Rails share localhost.
- No UI path attempts to end a session early; only firmware-reported `ended` state closes one.

## Data model and storage review

Directly inspected `app/models/`, `db/schema.rb`, and all five migrations. Current tables include users, devices, canonical posture sessions, accepted posture snapshots, groups, memberships, and invitations. Sessions use unique `(device_id, device_session_id)` plus unsigned-range checks and frozen ownership/calendar metadata. History uses `(received_at, posture_session_id, sequence)` and the ingestion service writes it atomically with accepted canonical updates. No generated model-map tasks exist; none were run or invented. No model, migration, or database change is needed for the current payload.

The account has no timezone column. Personal totals use configured `DEMO_TIMEZONE`, frozen per session; group rankings use Monday–Sunday in that fixed app timezone. Snapshot receipt history is sampled transport history, not episode timing. Preserve existing social rankings from canonical totals and do not add cumulative history rows together. The legacy challenge JSON is not the current competition scoring rule.

## Delivery stages and exit evidence

| Stage / proposed workstream | Deliverable | Exit evidence |
| --- | --- | --- |
| 1. Hardware/browser readiness | Record board, BNO055 placement, core/library versions, laptop/OS/browser; inspect identity and notifications | Real packet capture shows UUIDs/lengths/fields; held BOOT, sensor failure, and reconnect behavior recorded. Existing libraries need provenance/version review before installation or upgrade |
| 2. Decoder and fixtures | Pure parser plus deterministic real/synthetic transport interface | Exact byte fixtures, uint32 high-bit values, malformed packets, session-zero error, per-session revision ordering, old-connection callback rejection |
| 3. Authenticated saving | Account-bound in-memory queue using existing Rails routes | One request in flight; coalescing/retries; revision N+1 survives N acknowledgement; accepted history atomicity; unknown/non-owned and expired-login behavior; logout/account switch cannot reassign pending data |
| 4. Saved and live interface | Stimulus connection control, separate BLE/posture/saving status, saved summary refresh | Distinct pending/saved totals; no live-plus-saved double count; no synthetic end; accessible text states; mobile layout and unsupported-browser saved-data access |
| 5. End-to-end acceptance | Fixture browser tests and physical connected demo | Calibration, brief lean, >60s episode, recovery, reconnect, HTTP outage, reload and weekly saved totals. Explicitly record loss/incomplete-session limits |

These roles describe the original planning workstreams; the subsequent operator assignment authorized the software implementation recorded below. Stages 2–4 can use fixtures while real-device acceptance is pending. Use existing JS/Stimulus and test tooling where possible; no new dependency is selected by this plan. Follow [dependency safety](dependency-safety.md) before installing firmware or app tooling. No deployment or hosted database test is authorized.

### Queue and dashboard details

Capture first observation before the first upload. Retain the newest unsaved cumulative revision for every session, including a nonterminal old session when the wearable reboots. Keep a separate active-session pointer; old acknowledgements never replace newer live measurements. The current firmware publishes at roughly 1 Hz, so a 1-second coalescing cadence is sufficient without a websocket or raw sensor feed.

Preserve unsaved state across BLE disconnect in the same page. The in-memory queue is lost on reload/page close; warn truthfully, and never promise offline all-day recovery. A missing HTTP acknowledgement can mean the server committed: retry identical data and reconcile the response. After an accepted save, refresh Today/Weekly from the server (bounded to the upload cadence or slower); group rankings refresh through their existing page flow. Do not add live session totals on top of summaries that already include that session. Distinguish current device readings from saved totals explicitly.

Log out/account switching must stop uploads and invalidate callbacks before another account can use the page. Pause on auth expiry and resume only for the same account; see the API adaptation rules. Queue-full behavior blocks adding another session to the queue with a visible warning; it cannot stop the physical device. Offer explicit retry/disconnect and a clear unsaved-data choice rather than silently deleting old sessions.

### Verification matrix

- Firmware behavior: under/exactly/over 60 seconds, prolonged single episode, recovery/re-entry, brief slouch duration with zero episodes, recalibration, held BOOT staleness, sensor loss during tracking/calibration, reboot/identity persistence.
- Adapter: notification-before-read, duplicate/out-of-order/equal-conflict, uint32 range, invalid payload, older-session late callbacks, session-zero error, reconnect and changed identity, terminal repeats, stored terminal on reload, concurrent terminal upload with matching versus different counters.
- Saving: offline or 5xx retry, response lost after commit, newer revision during upload, queue bound, two-session preservation, no ownership claim, CSRF/login expiry, account switch while queued/in-flight, first-seen date frozen across retries/midnight.
- Persistence: reuse current isolated Rails tests for canonical/history atomicity, uniqueness races, duplicate/stale writes, ended immutability, regressing counters, ownership and aggregation. Never run against hosted user data.
- UI: no-data versus recorded zero, partial sessions, no fabricated daily buckets, separate link/sensor/save status, stale tab resume, keyboard/text status, existing mobile/desktop browser suite via fixtures.

For implementation verification, use the isolated commands in [local demo](local-demo.md), [account test setup](authentication-mvp.md#local-verification), and [Playwright coverage](playwright-user-loop-plan.md). Check pinned runtime and database isolation before executing them. Hardware compile/flash and physical BLE capture are separate manual checks, with commands determined only after the exact board/toolchain is recorded.

## Original planning validation and limits

The initial documentation pass reviewed firmware, decisions, roadmap, models, schema, migrations, controllers, queries, and ingestion source. Independent Python packing verified the four 20-byte fixtures in the BLE document. Whitespace and relative-link checks are documented with the handoff. At that planning stage, no application tests, firmware compilation, flashing, physical sensor measurement, provisioning, or deployment were performed. Software implementation verification is recorded separately below. Remaining uncertainty is operational/physical compatibility and future implementation, not a claim that a complete browser loop already exists.

## Implemented software and operational limits

The dashboard has Connect/Disconnect, live posture/session counters, explicit stale and sensor-error states, pending-save warnings and retry, and server-refreshed Today/Weekly totals. Saved group rankings continue to refresh on their existing page flow. The uploader retains the latest cumulative reading per session, preserves the first terminal revision, checks pre-existing terminal state on reload, coalesces at one second, and honors backoff/Retry-After. A new terminal revision has priority among ready entries; it does not bypass an existing server-requested retry delay.

No API endpoint, firmware, schema, dependency version, or ownership rule changed. Browser data is still an in-memory queue bound to its dashboard/account lifetime, with best-effort navigation/unload warnings. Account changes in another tab pause the old controller; immutable server-side device ownership remains the fail-safe when browser storage signals are unavailable. An account restored in another tab can explicitly retry the retained queue. No durable outbox, background tracking after page closure, or sensor recalculation was added.

Use `npm run test:ble` for standard-library Node tests and the existing `npm run test:e2e` harness for the real Rails ingestion path with synthetic BLE input. The native GATT transport also has fake-GATT ordering/cancellation tests. See [local demo verification](local-demo.md#browser-ble-integration) for executed checks and the physical-device checklist. Earlier sections retain the original planned acceptance scope; their physical tests are not implied by software test results.
