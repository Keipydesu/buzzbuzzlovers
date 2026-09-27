# 022 — Use a compact Today card with a detail page

Date: 2026-09-26.

Status: accepted user refinement; supersedes the dashboard Today presentation
in [decision 020](020-competition-first-uncluttered-dashboard.md).

## Context

The user requested a compact Today card with slouching minutes and a small
unlabeled graph on the right, opening a separate page for the existing detailed
totals. Their follow-up places it below Connect and the group card.

## Decision

Place Today below Connect and the group card, linking to authenticated `/today`. Show saved
slouching minutes and a small ring representing slouching versus other tracked
time. Provide an accessible chart description without visible graph labels.
Show an empty state when there is no saved activity. The detail page retains
episode count, tracked minutes, and slouching minutes without divider lines.

## Consequences

The `/today` destination is superseded by the period-selectable `/details` page
in [decision 023](023-period-details-and-chart-only-history.md).

The ring summarizes cumulative saved time; it does not invent an intraday
timeline. Weekly history remains on the dashboard. Pairing retains its live
metrics. Direct model/schema/migration review found no schema changes needed;
account-scoped queries and existing calendar allocation remain in force.

## Related documents

- [Previous layout](020-competition-first-uncluttered-dashboard.md)
- [Saved chart semantics](019-separate-pairing-and-weekly-chart.md)
