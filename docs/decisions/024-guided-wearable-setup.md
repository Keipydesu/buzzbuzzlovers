# 024 — Guide wearable setup one step at a time

Date: 2026-09-26.

Status: accepted user refinement; supersedes the wearable-page saved totals in
[decision 019](019-separate-pairing-and-weekly-chart.md).

## Context

The user requested a simpler wearable page: connect first, then explain
calibration, and remove the Today section.

## Decision

Initially show connection instructions and the Connect action. Once connected,
show upright positioning and BOOT-button calibration instructions. Show live
posture after readings arrive. Keep connection/staleness status and pending-save
or error feedback truthful. Hide routine saving messages and place device
identity/session diagnostics in an optional details section.

Remove saved Today totals and their background summary requests from this page.
Keep the dashboard link in a new tab while connected, and retain unsaved-data
navigation protection.

## Consequences

New-tab dashboard navigation is superseded by
[decision 025](025-dashboard-in-current-tab.md).

Calibration and classification still execute on the wearable. Account ownership,
upload reconciliation, and persistence are unchanged. Direct model/schema and
migration review found no data-model change needed. No dependencies are added.

## Related documents

- [Separate pairing page](019-separate-pairing-and-weekly-chart.md)
- [Period details](023-period-details-and-chart-only-history.md)
