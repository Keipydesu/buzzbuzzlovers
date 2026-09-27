# 026 — Preserve Bluetooth across in-app navigation

Date: 2026-09-26.

Status: accepted user correction; supersedes the navigation-disconnect limitation
in [decision 025](025-dashboard-in-current-tab.md) and the page-owned transport in
[decision 019](019-separate-pairing-and-weekly-chart.md).

## Context

The user observed that Go to dashboard disconnected the wearable and requested
continued tracking in the same tab.

## Decision

Keep Bluetooth transport, session reconciliation, and the upload queue in an
account-bound JavaScript session whose lifetime survives Turbo navigation.
The pairing controller observes this session and unsubscribes when its view is
removed. Returning to the wearable page restores its current connection state.

Dashboard, details, and group navigation retain the connection and pending
uploads. A compact status link exposes the active connection and saving errors
outside pairing. Explicit disconnect, logout, and document unload still stop the
transport. Account changes disconnect and pause the old account's queue.

## Consequences

Refresh, tab closure, or full-document navigation still ends the session; the
unsaved-data confirmation remains for document unload and logout. This does not
add a durable browser outbox. Device classification and the server's account
authorization remain unchanged. Direct model/schema/migration review found no
data-model changes necessary; no dependencies are added.

## Related documents

- [Same-tab dashboard](025-dashboard-in-current-tab.md)
- [Guided wearable setup](024-guided-wearable-setup.md)
- [BLE contract](../ble-protocol.md)
