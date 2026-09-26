# 008 — Show daily slouch frequency as bars

Date: 2026-09-26.

Status: accepted UI change; supersedes the daily line-chart choice in decision 007.

## Context

The user reconsidered the daily line graph and asked for a more appropriate chart. Episode counts are discrete observations within time windows; connected lines imply continuity between them.

## Decision

Use a bar chart for today's episode frequency. Each bar represents qualified episode counts in one 30-minute window in the mockup. Label recorded zero counts as zero, and missing windows as no data. Keep the daily chart first, the more-than-one-minute qualification requirement, and the weekly average reference line.

## Consequences

The time-bucket contract is still unimplemented. All preview values remain synthetic, with mock-data notes in the repository rather than in the product interface, as explicitly requested. This change does not alter classification, storage, or the BLE/API contracts.

The top-of-page ordering is subsequently refined by [decision 009](009-compact-goal-above-today.md).

## Related documents

- [Habit-trend hierarchy and data requirements](007-lead-with-habit-trends.md)
- [Episode qualification](006-one-minute-slouch-qualification.md)
