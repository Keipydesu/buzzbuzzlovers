# 019 — Separate pairing and restore a visual weekly dashboard

Date: 2026-09-26.

Status: accepted user direction; presentation details implemented under the requested UI work. Supersedes the table-only history presentation in decision 014.

## Context

The user requested moving the pairing panel to another page, reducing dashboard prose, and restoring the weekly graph. Current canonical sessions already support seven-day totals; they do not support historical half-hour episode buckets.

## Decision

Put Bluetooth pairing, live readings, saving status, and expandable setup help on the authenticated `/wearable` page. Keep a prominent Wearable link on the dashboard. Lead the dashboard with compact Today metrics and a stacked seven-day chart, followed by group competition and the Muse link.

Use saved tracked minutes split into device-classified non-slouch and slouch time. Show a dashed average tracked-minutes line across days with saved sessions, including recorded zero-duration days and excluding missing days. Mark missing dates separately from recorded zeros. Preserve a first-seen-date caption, per-day accessible descriptions, and an expandable exact-value table. Do not fabricate daily frequency buckets or relabel non-slouch time as clinically correct posture.

## Consequences

Page-owned Bluetooth transport is superseded by the persistent session in
[decision 026](026-preserve-bluetooth-across-app-navigation.md).

New-tab dashboard navigation is superseded by
[decision 025](025-dashboard-in-current-tab.md).

The expandable data table is subsequently removed under
[decision 023](023-period-details-and-chart-only-history.md).
Wearable-page totals are removed in favor of guided setup under
[decision 024](024-guided-wearable-setup.md).

The wearable page owns the existing transport and in-memory upload queue. Its dashboard link opens another tab so tracking can continue; navigating the wearable page itself disconnects Bluetooth and retains the existing unsaved-data confirmation. Dashboard history is loaded from saved data on page load/reload. Pairing-page Today metrics refresh after saves.

Direct review of models, schema and all five migrations found no data-model change necessary. Authentication, ownership, device classification and ingestion remain unchanged. No dependencies are added. Physical BLE verification remains separate from automated fixture coverage.

Dashboard ordering and the visible first-seen-date caption are subsequently refined by [decision 020](020-competition-first-uncluttered-dashboard.md). Calendar allocation semantics remain unchanged.

## Related documents

- [Prior saved-data presentation](014-weekly-competition-implementation-defaults.md)
- [Habit trends and weekly average](007-lead-with-habit-trends.md)
- [Local demo and verification](../local-demo.md)
- [Roadmap](../ROADMAP.md)
