# 006 — Count slouches only after more than one minute

Date: 2026-09-26.

Status: accepted product requirement; firmware implementation and hardware validation pending.

## Context

The user wants to improve a habit over time. Brief posture changes should not inflate slouch frequency.

## Decision

A detected slouching posture change must persist continuously for **more than 60 seconds** before it qualifies as a slouch episode. Exactly 60 seconds is not sufficient. Count the sustained episode once; continued slouching does not create another episode each minute. Returning to the calibrated range ends the episode, consistent with the MVP lifecycle.

Apply qualification on the ESP32, preserving decision 001. The dashboard displays qualified episode counts from the device; it does not classify posture or run an independent qualification timer.

## Consequences

This settles the persistence threshold, not the sensor-angle threshold. Filtering, hysteresis, handling missing/error samples, and whether cumulative slouch duration includes the initial minute still need explicit firmware rules. A short return below the slouch threshold before qualification must not be added to a later candidate as continuous persistence; exact filtering of noisy samples remains open.

Validate durations below 60 seconds, exactly 60 seconds, and above 60 seconds; prolonged single episodes; return and re-entry; and sensor interruptions. Do not reinterpret old fixtures as validated measurements under this rule. No firmware exists in the reviewed repository, so this record and the preview copy do not establish that the rule is implemented.

## Related documents

- [Device-side classification](001-device-side-posture-classification.md)
- [BLE contract](../ble-protocol.md)
- [MVP](../MVP.md)
