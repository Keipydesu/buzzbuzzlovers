# 017 — Qualify slouching at ten seconds and reset after three seconds upright

Date: 2026-09-26.

Status: accepted operator requirement; supersedes decision 006 and the timing-preservation portion of decision 016. The shared state timing is superseded by [decision 032](032-live-slouch-state.md): `state` now reports live posture, while the LED, warning and counters keep this timer.

## Context

Physical testing exposed different LED, duration and episode rules. The operator requested a ten-second grace period and three-second upright reset, explicitly clarified that qualification credits the preceding ten seconds, and confirmed that the episode counter also increments at ten seconds.

## Decision

Keep classification on the ESP32. A continuous forward lean shorter than 10,000 ms contributes no slouch duration or episodes. At the first sample at or after 10,000 ms, enter `slouching`, count one episode, and credit the entire candidate interval once (including sampling overshoot). Subsequent sampled elapsed time continues accumulating normally.

Remain slouching until upright posture is sustained for at least 3,000 ms. Recovery time is included until that transition. A shorter upright interruption stays in the same episode, resets the recovery timer on renewed leaning, and never adds another qualification credit or episode. Before qualification, any upright sample discards the candidate. Sensor error and calibration clear detection; saved cumulative totals stay intact. LED and reported slouch state use this same timer.

## Consequences

The former >60-second episode rule is superseded. `upright` telemetry includes an unqualified lean during the grace period; it is not a raw angle indicator. The 20-byte BLE layout, UUIDs and v1 JSON stay unchanged. Stored data from older firmware retain their original meanings; neither Rails nor the browser rewrites old counters or infers firmware behavior from protocol version 1. Flash the new sketch (including its adjacent header) to obtain the new measurements. Host C++ tests validate timing logic; they do not establish a successful ESP32 build or physical sensor accuracy.

## Related documents

- [Live slouch state](032-live-slouch-state.md)
- [Superseded episode rule](006-one-minute-slouch-qualification.md)
- [Existing hardware baseline](016-integrate-existing-hardware.md)
- [Device-side classification](001-device-side-posture-classification.md)
- [BLE contract](../ble-protocol.md)
- [Local verification](../local-demo.md)
