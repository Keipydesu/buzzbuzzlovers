# 007 — Lead the dashboard with habit trends

Date: 2026-09-26.

Status: accepted interface priority; daily chart type superseded by [decision 008](008-daily-frequency-bars.md). Real timeline integration pending.

## Context

The user clarified that the app helps improve a habit, and requested today's slouch-frequency line graph as the first main content, plus a weekly average line. Current posture should not lead the dashboard.

## Decision

Lead with today's slouch-frequency trend and supporting totals. Keep goals and milestones secondary. This refines the open layout in decision 004; its focused tracker and color direction remain accepted.

The preview uses episode counts per 30-minute window, not cumulative counts or an overall health score. Zero means an observed window with no qualified episodes; a missing observation creates a gap. These bucket sizes are a preview choice, not a frozen device contract.

Overlay a labeled weekly-average line on the existing stacked tracked-time bars. For this preview, it is total tracked minutes divided by the number of recorded days (excluding no-data days). It is not average slouch frequency or a target. Preserve first-seen-date labeling until accurate calendar allocation is supported.

## Consequences

The schema and API contain cumulative session counters, not historical episode timestamps or time buckets. The proposed accepted-snapshot history is sampled transport history, not complete activity history. Do not derive accurate half-hour episode times from receipt times or spread cumulative counts across the day. A real timeline requires an agreed device-timed bucket/event contract with exposure coverage, clock mapping, gap handling, and a rule for assigning an episode that crosses a bucket boundary. This work remains unimplemented; the UI uses synthetic data only. At the user’s request, the mockup omits sample/preview labels from the visible interface so it reads like the proposed finished product. This does not connect real tracking or saving; its mock-data status remains documented here and in the README.

Direct review of models, schema, migrations, API, and BLE documents found no schema change necessary for the visual preview. No classification changes are made in Rails or browser code.

The top-of-page ordering is subsequently refined by [decision 009](009-compact-goal-above-today.md).

## Related documents

- [Focused interface](004-focused-health-tracker-interface.md)
- [Subtle gamification](005-subtle-gamification.md)
- [Episode qualification](006-one-minute-slouch-qualification.md)
- [App plan](../APP_PLAN.md)
- [API](../app-api.md)
