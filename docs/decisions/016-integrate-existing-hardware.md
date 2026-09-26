# 016 — Integrate the existing hardware interface

Date: 2026-09-26.

Status: accepted integration direction; browser adapter details proposed, not implemented.

## Context

The operator requested a full integration plan and API documentation based on the hardware source, then clarified that software should adapt to the hardware. The checked-in ESP32/BNO055 detector already publishes the proposed 16-byte identity and 20-byte v1 snapshot, while the browser transport is missing. The Rails schema and snapshot endpoint already represent those fields.

## Decision

Use the current [detector source](../../Hardware/slouch_detector/slouch_detector.ino) as the integration baseline. Preserve device-side classification, actual duration/count semantics, physical BOOT calibration, and the existing BLE layout. Plan browser compatibility around observed firmware behavior; do not make a firmware rewrite or new backend schema a prerequisite without a demonstrated need.

The browser must not invent an end event on disconnect/reboot, reinterpret short-lean duration as qualified-episode duration, or fabricate counters/session identity to hide regressions. Preserve the backend's immutable ended-session and account-ownership rules. Document current limitations and proposed compatibility handling separately from verified implementation.

## Consequences

The browser can reuse current Rails ingestion, atomic accepted history, and first-seen-date summaries. Recalibration stays in a session; normal power-off leaves incomplete saved totals. Current terminal heartbeat behavior needs client suppression/reconciliation, described as a proposal in the API document. Exact physical reliability, demo laptop, mounting, dependencies, and firmware error/overflow behavior still need testing.

No accepted classification, scoring, or storage decision is superseded. The original BLE draft's unresolved descriptions are updated to describe existing source; this does not freeze optional future protocol extensions or claim hardware validation. Planning authorizes documentation only, not firmware/app implementation, provisioning, dependency installation, or deployment.

## Related documents

- [Hardware integration plan](../hardware-integration-plan.md)
- [BLE telemetry](../ble-protocol.md)
- [App API](../app-api.md)
- [Device-side classification](001-device-side-posture-classification.md)
- [Episode qualification](006-one-minute-slouch-qualification.md)
- [Local demo scope](015-local-mvp-demo.md)
