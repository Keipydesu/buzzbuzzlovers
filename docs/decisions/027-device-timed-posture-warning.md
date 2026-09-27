# 027 — Device-timed posture warning

Date: 2026-09-26.

Status: accepted user request; firmware source implemented, not physically flashed or verified.

## Context

The user wants a topmost warning that fades in before qualification, reaches full
opacity three seconds before the ten-second threshold, shakes once on qualification,
and fades out during the three-second recovery. The existing snapshot only reports
qualified state, so it cannot reveal either pre-qualification lean or recovery.

## Decision

Add an optional read/notify characteristic carrying device-calculated warning phase,
elapsed milliseconds, session, revision and episode. Keep the existing snapshot and
Rails API unchanged. Classification and timers remain on the ESP32. The browser
interpolates presentation between fresh device reports, reaches full opacity at
seven seconds, and only shakes when the device confirms qualification. Recovery
fades over three seconds; interrupted recovery remains the same episode.

Place the notice at the viewport top with z-index 10000. It does not intercept clicks.
Respect reduced-motion preferences by omitting the shake. Disconnected, stale,
calibrating and sensor-error states suppress the warning. Legacy firmware retains
a qualified-state notice, without fabricated pre-threshold timing.

## Consequences

The full animation needs the updated sketch flashed and a fresh Bluetooth connection.
Host timing tests and synthetic browser checks do not establish ESP32 compilation,
radio latency or physical posture accuracy. No dependencies, database models or
schema changes are needed; direct model/schema review remains applicable.

## Related documents

- [Device classification](001-device-side-posture-classification.md)
- [Qualification and recovery](017-ten-second-slouch-grace.md)
- [BLE protocol](../ble-protocol.md)
