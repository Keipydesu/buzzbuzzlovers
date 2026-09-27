# 032 — Report slouching state live; keep the ten-second timer for alerts and totals

Date: 2026-09-27.

Status: accepted user request; supersedes the shared state timing in decision 017. Firmware flashed and compiled on the team's ESP32; the full lean sequence has not yet been observed on hardware.

## Context

Under [decision 017](017-ten-second-slouch-grace.md), the snapshot `state`, the LED and the counters all shared one ten-second timer, so `state` stayed `upright` during a forward lean until it qualified. The user wants the live posture label to switch to `slouching` as soon as they lean forward and back to `upright` as soon as they sit up, with only the alert waiting ten seconds.

## Decision

Keep classification on the ESP32 ([decision 001](001-device-side-posture-classification.md)). The snapshot `state` reports the current posture: `slouching` whenever the wrapped angle difference is strictly below `-10` degrees, otherwise `upright`. It has no grace period and no recovery window.

The ten-second qualification and three-second reset from decision 017 still govern:

- the LED;
- the posture warning characteristic ([decision 027](027-device-timed-posture-warning.md));
- `slouch_seconds` (full candidate credit at qualification, then accrual until three seconds continuously upright);
- `episode_count`.

Slouch time accrues from the qualification timer, not from `state`, so the grace period is credited exactly once.

## Consequences

- `state` and the counters can disagree. During the first ten seconds of a lean, `state` is `slouching` while `slouch_seconds` does not grow. During recovery, `state` is `upright` while `slouch_seconds` still grows and the LED stays on. Anything that needs "qualified" slouching must use the warning phase or the counters, not `state`.
- Brief leans now appear as `slouching` in live displays, even though they contribute nothing to totals. A lean hovering at the threshold can change `state` often; each change publishes a snapshot.
- The BLE layout, UUIDs, protocol version and counter meanings are unchanged. Rails and the browser need no changes. Only the meaning of the live `state` field differs, and v1 packets do not identify the firmware revision.

## Related documents

- [Ten-second qualification](017-ten-second-slouch-grace.md)
- [Device-timed posture warning](027-device-timed-posture-warning.md)
- [Device-side classification](001-device-side-posture-classification.md)
- [BLE contract](../ble-protocol.md)
