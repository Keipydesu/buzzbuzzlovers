# 028 — Software calibration control

Date: 2026-09-26.

Status: accepted user request; source implemented, firmware build/flash and physical BLE verification outstanding.

## Context

The user requested calibration from the connection menu instead of reaching for BOOT.
The existing BLE service had no writable calibration control.

## Decision

Add an optional write-with-response characteristic accepting version 1, command 1.
The BLE callback only queues a request; the ESP32 main loop invokes the same
calibration routine as BOOT. Initial calibration starts a session; recalibration
preserves its counters. Ignore requests while calibrating, ended, or sensor unavailable.

Show Calibrate after connection and Recalibrate when ready. Disable during a request
or calibration. Device snapshots confirm calibration started and completed; a successful
GATT write alone never unlocks the dashboard. An unconfirmed request times out with
an actionable message. Legacy firmware keeps BOOT support and a disabled software button.

## Consequences

Requires flashing updated firmware and reconnecting. Browser fixture tests and command
transport tests do not verify the physical wearable. No dependency, model or schema
changes; device-side classification remains intact. The existing unpaired BLE service
has no application-level command authorization; this command is available to its
connected central, not authenticated through Rails.

## Related documents

- [Device-side classification](001-device-side-posture-classification.md)
- [Guided setup](024-guided-wearable-setup.md)
- [BLE protocol](../ble-protocol.md)
