# 034 — Match the landing header and chart to the app

Date: 2026-09-27.

Status: accepted user direction; extends decision 020 to the public landing page.

## Context

The landing header was crowded on phones, and its decorative bars did not match the saved-history chart.

## Decision

Use the app's compact theme icon and account-menu presentation on the landing page. Put login and signup links inside that menu while retaining the prominent account actions in the hero.

Render the existing weekly chart partial with fixed sample data and a visible “Sample week” heading. Reuse its stacked bars, legend, axes, average line, missing-data state, and accessible descriptions.

## Consequences

Sample values remain separate from saved user activity. Future shared-chart changes also apply to the landing preview. Direct model/schema/migration review found no data-model changes necessary; no dependencies were added. Browser verification uses the isolated local Playwright database and does not validate physical hardware.

## Related documents

- [Compact app header](020-competition-first-uncluttered-dashboard.md)
- [Chart-only history](023-period-details-and-chart-only-history.md)
- [Mobile-first interface](../mobile-first-interface.md)
