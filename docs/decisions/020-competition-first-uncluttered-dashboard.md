# 020 — Put weekly competition first and simplify dashboard copy

Date: 2026-09-26.

Status: accepted user refinement; supersedes dashboard ordering and visible calendar captions in decision 019, and the visible first-seen-date labeling in decision 007.

## Context

After seeing the separate-pairing dashboard, the user identified the three stacked header rows and Today’s technical notes as clutter. They explicitly asked to remove first-seen-date terminology and put weekly gamification at the top.

## Decision

Use one compact header with the brand, a Wearable link, an accessible theme icon, and an account menu. Reuse it on the dashboard, groups, wearable page, and coach; retain account controls for pages without this shared header.

Place the weekly competition card above Today and the weekly chart. Keep Today focused on the three recorded metrics and its empty state. Remove calendar/timezone captions and unfinished-session notes from the dashboard. Keep saving/live-session diagnostics on the wearable page and calendar-allocation limitations in the repository documentation. Exact weekly values remain in the expandable table.

## Consequences

This changes presentation, not aggregation: the entire canonical session still belongs to its frozen first-observed date, and overnight sessions are not split. No missing time is invented. Competition scoring and account ownership remain unchanged. Theme and account controls retain accessible names and 44px targets.

Direct model/schema/migration review remains applicable: no data-model or dependency changes. The revised shared header requires account/navigation and narrow-screen regression checks in addition to chart and BLE checks.

## Related documents

- [Separate pairing and weekly chart](019-separate-pairing-and-weekly-chart.md)
- [Prior habit-trend presentation](007-lead-with-habit-trends.md)
- [Local verification](../local-demo.md)
- [API calendar semantics](../app-api.md)
