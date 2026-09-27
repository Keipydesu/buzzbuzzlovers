# 021 — Rename the app to pose.

Date: 2026-09-26.

Status: accepted user direction.

## Context

The user renamed the app from bbl to `pose.` during interface refinement.

## Decision

Use lowercase `pose.` with the trailing period in visible branding, page titles,
application metadata, and the project introduction. Retain the existing colors
and layout.

## Consequences

Historical records keep the former name. Internal database, deployment, browser
storage, account-event identifiers, and the firmware's advertised `bbl-posture`
name remain compatible with existing installations.

Direct review of models, schema, and migrations found no data-model change
needed. This is a presentation change with no dependency changes. Browser runtime
verification is limited by the sandbox's Chromium launch restriction.

## Related documents

- [Project introduction](../../README.md)
- [Interface direction](004-focused-health-tracker-interface.md)
