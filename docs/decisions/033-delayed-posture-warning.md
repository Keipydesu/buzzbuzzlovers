# 033 — Delay the posture warning before fading in

Date: 2026-09-27.

Status: accepted user correction; supersedes warning onset and legacy fallback in [decision 027](027-device-timed-posture-warning.md).

## Context

The warning started fading immediately, and its legacy fallback displayed live
slouch state at full opacity. The recorded correction requires three quiet seconds
before the fade. Decision 032 makes live posture immediate, so that state cannot
stand in for device qualification timing. This records the correction under the
next unused number; the existing untracked draft numbered 029 remains untouched.

## Decision

Use device timing: hidden through three seconds, linear fade from seconds 3–7,
full opacity thereafter, and one small shake when the device confirms qualification
at ten seconds. Fade out during the three-second recovery. If a candidate ends
before qualification, fade its current opacity to zero over three seconds after
the device reports neutral. Neutral heartbeats do not restart that fade.

Suppress warnings when timing is absent, stale, disconnected, in calibration or
in sensor error. Do not infer qualification from the live posture label. Preserve
reduced-motion handling and device ownership of classification and counters.

## Consequences

Older firmware still connects but cannot show this warning without timing data.
No dependencies or firmware payloads change. Direct review of models, schema and
migrations found no data-model change needed. Node and synthetic browser checks
cover presentation; physical BLE and sensor behavior require a separate check.

## Related documents

- [Original warning design](027-device-timed-posture-warning.md)
- [Live slouch state](032-live-slouch-state.md)
- [BLE protocol](../ble-protocol.md)
