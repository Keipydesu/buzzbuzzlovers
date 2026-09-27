# BLE telemetry and browser mapping

**Status: current checked-in firmware interface, source-reviewed on 2026-09-26; browser integration has automated fixture coverage; physical transport has not been verified.** [Decision 016](decisions/016-integrate-existing-hardware.md) uses the existing firmware as the baseline. The ESP32 owns calibration, posture classification, and episode timing. The browser decodes and transports calculated results to the [Rails API](app-api.md). Follow the [integration plan](hardware-integration-plan.md) for implementation and acceptance gates.

## Source and service

The integration target is [slouch_detector.ino](../Hardware/slouch_detector/slouch_detector.ino). The [read-all-data sketch](../Hardware/read_all_data/read_all_data.ino) and [I2C scanner](../Hardware/i2c_scanner/i2c_scanner.ino) are serial diagnostics, not additional BLE feeds. The tracked directory is `Hardware/` with nested sketch directories; use this casing on case-sensitive systems.

The detector initializes a BNO055 at I2C address `0x28`, SDA `21`, SCL `22`, in `OPERATION_MODE_IMUPLUS`. It reads Euler `orientation.z` for pitch, uses BOOT GPIO `0` for calibration and LED GPIO `17` for warning. Exact board, mounting, power, library versions, and physical reliability still require verification. No raw pitch, calibration baseline, LED state, battery, wall clock, or episode timestamps are included in BLE telemetry.

| Item | UUID | Properties |
| --- | --- | --- |
| Posture service | `caa153e1-8bec-412c-a7ea-570bf12cbd13` | Advertised as `bbl-posture` |
| Device identity | `5a02ab16-022f-43a7-8b81-2d136526c605` | Read, exactly 16 bytes |
| Session snapshot | `3ea72a7d-ef99-4f43-95d7-d6860687824e` | Read, Notify, exactly 20 bytes |

An optional calibration command is described below. Identity is generated with `esp_fill_random` and stored with the session counter in Preferences namespace `bbl` (`id`, `sess`). The source regenerates identity when the session key is missing or the stored identity length is wrong. Convert bytes in wire order to 32 lowercase hex characters; do not use the Bluetooth name, browser Bluetooth ID, or UUID-endian formatting as the Rails identity. Identity is public, not an ownership credential. Preferences write success is not checked by this sketch, so power-loss durability is an assumption to test, not a guarantee.

## Snapshot encoding

All multi-byte fields are **unsigned, little-endian**. Reject lengths other than 20, unsupported versions, and unknown states. Use `DataView.getUint32(offset, true)` / `getUint16(offset, true)` rather than signed bitwise assembly; all wire integers fit exactly in JavaScript numbers.

| Offset | Type | Firmware field | HTTP mapping |
| --- | --- | --- | --- |
| 0 | uint8 | version = `1` | `snapshot.protocol_version` |
| 1 | uint8 | state enum | `snapshot.state`, map below |
| 2 | uint32 | session_id | URL `:device_session_id`; `0` is display-only |
| 6 | uint32 | sequence | `snapshot.sequence` |
| 10 | uint32 | tracked_seconds | `snapshot.tracked_seconds` |
| 14 | uint32 | slouch_seconds | `snapshot.slouch_seconds` |
| 18 | uint16 | episode_count | `snapshot.episode_count` |

| Code | API string | Source behavior |
| --- | --- | --- |
| 0 | `idle` | Waiting for first calibration; no tracked time |
| 1 | `calibrating` | BOOT-triggered baseline capture; no tracked time |
| 2 | `upright` | Not yet qualified as slouching (including a lean shorter than 10 seconds); tracked time accumulates |
| 3 | `slouching` | Qualified continuous lean of at least 10 seconds, including recovery until 3 seconds upright; tracked and slouch time accumulate |
| 4 | `sensor_error` | Sensor check failed; tracking pauses after detection; may occur with session `0` at boot |
| 5 | `ended` | Currently reached only when another qualifying episode would overflow episode count |

In normal operation sequence starts at `1` after allocating a positive session. Session `0` snapshots also have a heartbeat sequence, but no activity counters; display their state without calling Rails ingestion. The source can publish session `0` with `sensor_error`, not only `idle`.

## Measurement semantics

The current sketch uses wrapped angle difference from its captured upright baseline. A difference strictly below `-10` degrees is forward slouching; leaning back and exactly `-10` are not. These are code settings, not validated ergonomic thresholds. The app must not reclassify angles or apply independent persistence filters.

- Nominal loop delay is 100 ms plus sensor/serial/other work. Each loop credits elapsed milliseconds to the preceding posture state, then evaluates the sensor. Transmitted totals are floored whole seconds. This is sampled interval accounting; it does not locate a transition within a sample interval.
- `tracked_seconds` accumulates in upright/slouching states. Before qualification, a lean contributes no slouch time. At the first sample at or after 10,000 ms of continuous forward lean, credit the full candidate duration once and increment `episode_count` once. The preceding ten seconds are included, as is any sampling overshoot. `slouch_seconds <= tracked_seconds` still holds.
- `state` reports live posture per [decision 032](decisions/032-live-slouch-state.md): `slouching` whenever the lean is past the threshold, otherwise `upright`, with no grace or recovery window. The LED, warning, `slouch_seconds` and `episode_count` follow [decision 017](decisions/017-ten-second-slouch-grace.md): slouch time accrues from the qualification timer, not from `state`, and continues until at least 3,000 ms continuously upright, counting the recovery interval too. A shorter upright interruption neither increments the episode nor credits the candidate again. Before qualification, any upright sample discards the candidate. Calibration and classified sensor error clear detection.
- The old >60-second episode rule is superseded. UUIDs/layout/version are unchanged; previously saved sessions and devices still running old firmware retain their original semantics. The app transports their counters without reclassification; update the firmware to use the new timing.
- Calibration waits roughly 1 second to settle, then averages readings over the following 3 seconds. Recalibration preserves the existing session and counters. Sensor loss during calibration can leave it calibrating and later use too few or pre-gap samples. Recovery from a mid-session sensor error reuses the old baseline.

A current-firmware episode includes at least its ten-second candidate credit. Older firmware may report nonzero slouch duration with zero episodes, which remains wire-valid. Neither field establishes medically correct posture.

## Publication and session lifecycle

`publish()` updates the cached characteristic, increments sequence, and notifies if connected, approximately once per second plus state changes. Publication continues while disconnected. Reads of the cached value do not increment sequence. BOOT handling waits synchronously for release, so holding it pauses publications and sampling; a browser stale warning may therefore occur without a link disconnect.

On first calibration after boot, the firmware increments and attempts to persist a session counter, clears in-memory measurement counters, and publishes the new session beginning at revision 1. Recalibration remains in the same session. Reboot discards the RAM session and totals, returning to pre-session status; next calibration normally allocates a new session. There is no retained session archive, application-level acknowledgement, or ordinary end control. Disconnect is never an end event. A missed previous session cannot be recovered after reboot.

The source only guards episode-count overflow. Sequence increment, session allocation and uint32 duration conversion can wrap; flash operations are unchecked. The browser must reject regressions/reuse rather than fabricate corrected counters or identities. These limits should be tested/documented for the demo, with firmware hardening considered separately. Source compatibility does not prove unbounded-duration reliability.

After reaching `ended`, the sketch continues publishing higher sequence numbers with unchanged counters. Rails deliberately treats a stored ended session as immutable. The browser adapter latches the first observed terminal snapshot and retries that exact payload, then suppresses further terminal uploads if version, state, and counters are unchanged. It still observes BLE liveness. A later state/counter change is a protocol error. Reload/concurrent-tab handling compares authorized server state as specified in [the API adaptation rules](app-api.md#adaptation-to-the-current-firmware); do not change measured fields or weaken backend reconciliation.

## Browser transport and ordering

On a user click, discover by service UUID, connect GATT, read/validate identity, attach the snapshot handler, subscribe, then read the cached snapshot. Serialize GATT operations and feed reads/notifications into the same ordering path. A notification that arrives during the read may already be newer. Bind all callbacks to the active connection generation and identity; invalidate them at disconnect/account change. Reconnect obtains fresh services/characteristics and repeats subscription/read setup.

Web Bluetooth requires a secure context and user-initiated discovery. Check `window.isSecureContext` and `navigator.bluetooth`, and verify the exact demo laptop/browser with the real device. A responsive page alone does not establish Bluetooth support. [Chrome Web Bluetooth documentation](https://developer.chrome.com/docs/capabilities/bluetooth).

Key cumulative state by `(device_id, session_id)`. Reject invalid ranges, counter regressions, and equal-revision conflicting payloads. Ignore stale/identical readings without replacing newer live state. Track the active session independently from pending older-session uploads. No new valid revision for 3 seconds marks tracking stale; disconnection is immediate. Stale/disconnected/error never means upright, zero activity, or ended. After tab suspension, show unknown freshness until a fresh read/heartbeat; an ended session remains ended with separate link status.

## Reconnection and calendar limits

Same-session reconnect can recover current cumulative totals retained in RAM despite missed notifications. It cannot recover overwritten sessions, identify individual episode timestamps, split activity across midnight, or reconstruct coverage from server receipt times. Saved partial sessions remain incomplete unless the device actually reports ended.

Use the current first-observed-date grouping: the browser captures an observation timestamp for each positive session; Rails freezes it and the configured timezone at first insert. Label personal totals “Sessions by first-seen date.” A late first observation is not the device's start time. No half-hour episode chart or accurate per-day activity split can be produced from this payload. Durable browser outbox, device history, time synchronization, remain separate extensions.

## Review fixtures and verification

The following are synthetic fixtures, not captured hardware readings:

| Purpose | Bytes / expected values |
| --- | --- |
| Realistic integration example | `01 03 07 00 00 00 b5 00 00 00 b4 00 00 00 46 00 00 00 01 00`: v1, slouching, session 7, revision 181, tracked 180, slouch 70, episodes 1 |
| Pre-session sensor failure | `01 04 00 00 00 00 01 00 00 00 00 00 00 00 00 00 00 00 00 00`: display sensor error, do not upload |
| Historical layout-only fixture | `01 02 07 00 00 00 0c 00 00 00 3c 00 00 00 0a 00 00 00 02 00`: upright, session 7, revision 12, tracked 60, slouch 10, episodes 2. Byte-valid, but physically inconsistent with two ten-second qualification credits; do not present as real demo activity |
| Unsigned range check | `01 02 ff ff ff ff ff ff ff ff ff ff ff ff 00 00 00 80 ff ff`: session/revision/tracked = 4294967295, slouch = 2147483648, episodes = 65535; parser boundary only, not a source-reachable longevity claim |

Python `struct` with `<BBIIIIH` independently verified these 20-byte layouts during documentation review. This is not firmware compilation or a BLE capture. Future tests must cover wrong lengths/version/state, equal conflicts, duplicates/stale data, decreasing counters, unsigned bounds, session-zero error, recalibration, reboot, terminal repeats/reload races, disconnect versus HTTP failure, and real below/exactly/above-10-second qualification and 3-second recovery trials. Record board, firmware/core/library versions, laptop/OS/browser, observed packets, and limitations during physical acceptance.

## Optional live warning timing

[Decision 027](decisions/027-device-timed-posture-warning.md) adds read/notify
characteristic `9c052810-52d4-4fc9-9c03-f37e93874bc1` to the existing service.
This is a source implementation requiring a firmware flash; physical BLE timing
and the ESP32 build have not been verified. The original 20-byte snapshot and API
stay unchanged. Older firmware without this characteristic remains supported.

The separate 14-byte little-endian payload contains:

| Offset | Type | Meaning |
| --- | --- | --- |
| 0 | uint8 | Warning format version 1 |
| 1 | uint8 | 0 neutral, 1 candidate lean, 2 qualified, 3 recovering |
| 2 | uint32 | Current session ID |
| 6 | uint32 | Same publication revision as the session snapshot |
| 10 | uint16 | Candidate/recovery elapsed ms; qualified is 10000, neutral is 0 |
| 12 | uint16 | Current episode count |

Firmware publishes phase transitions immediately on the next sampled loop, plus
its usual heartbeat. Recovery elapsed is at most 3000 ms; candidate elapsed is at
most 10000 ms. Reset/calibration/error clears the warning. Browser reads and
notifications share ordering checks; duplicate/stale revisions never renew freshness.
The browser interpolates elapsed time only for presentation while data is fresh
(up to three seconds), never for counting episodes or saving durations. The warning
stays hidden through 3000 ms, fades linearly to opacity 1 at 7000 ms, shakes once
per confirmed episode, and fades from 1 to 0 during recovery. Renewed leaning
cancels recovery without a second shake. A candidate returning to neutral fades
from its current opacity over three seconds; neutral heartbeats do not restart it.
Without timing data, live slouch state alone does not show a warning. See
[decision 033](decisions/033-delayed-posture-warning.md).


## Optional software calibration

[Decision 028](decisions/028-software-calibration-control.md) adds characteristic
`883c8f42-529b-47ef-ae21-278020ae5c55` with Write (with response). The exact two-byte
payload `01 01` means format version 1, calibrate. Other lengths, versions and
commands are ignored. The callback atomically queues a request for the sensor loop;
requests during calibration, an ended session or unavailable sensor are ignored.
The same one-second settling and three-second baseline capture as BOOT applies.

The browser discovers this characteristic optionally, serializes the write with
GATT reads, and guards the active connection/account. A GATT write acknowledgement
is not calibration completion. Only fresh `calibrating` then `upright`/`slouching`
snapshots drive the setup flow. If no calibration-start confirmation arrives within
five seconds, the app allows retry and offers BOOT. Old firmware without the
characteristic remains connectable. Software calibration requires flashing the
updated source; ESP32 compilation and physical command handling are unverified.
