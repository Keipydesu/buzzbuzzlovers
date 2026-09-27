# 023 — Add period details and remove the data-table toggle

Date: 2026-09-26.

Status: accepted user direction; supersedes the `/today` destination in
[decision 022](022-compact-today-detail-page.md) and expandable history table in
[decision 019](019-separate-pairing-and-weekly-chart.md).

## Context

The user requested a Details page with Day, Week, and Month time frames and a
clear graph. They also requested removing the customer-facing data-table toggle.

## Decision

Link the compact Today card to authenticated `/details`; redirect `/today` there.
Day shows today's saved time split into slouching and non-slouching in a ring.
Week shows the last seven days and Month the last thirty days as daily stacked
bars, with explicit date ranges. These rolling windows are implementation
defaults. All views show totals for their selected period.

Remove the expandable data table from both dashboard and detail charts. Keep
accessible per-day descriptions, missing-versus-zero distinctions, and legends.

## Consequences

No intraday chronology is invented from cumulative counters. Use the existing
account-scoped canonical sessions and calendar-day assignment. Direct model,
schema and migration review found no data-model change necessary. No dependencies
are added.

## Related documents

- [Compact Today card](022-compact-today-detail-page.md)
- [Saved history chart](019-separate-pairing-and-weekly-chart.md)
