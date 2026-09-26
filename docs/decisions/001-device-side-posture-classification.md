# 001 — Keep posture classification on the wearable

Date: 2026-09-26 (recorded from the existing agreed architecture)

Status: accepted

## Context

The wearable sends calculated posture state and cumulative counters over BLE. The app provides awareness, saved history, and rewards.

## Decision

Calibration, posture classification, and episode timing run on the ESP32. The browser transports and displays results; Rails stores and aggregates them. Neither browser nor backend classifies raw sensor data.

## Consequences

Changing storage or hosting must preserve this boundary. Hardware selection, thresholds, and controls still need decisions and validation. Cloud history does not create missing activity timestamps or offline device history.

## Related documents

- [MVP scope](../MVP.md)
- [BLE protocol](../ble-protocol.md)
- [App plan](../APP_PLAN.md)
