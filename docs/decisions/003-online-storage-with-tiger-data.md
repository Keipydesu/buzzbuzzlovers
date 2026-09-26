# 003 — Plan online user storage with Tiger Data hypertables

Date: 2026-09-26

Status: accepted direction; integration details proposed, not implemented

## Context

Users should not need to run a local database or retain long-term history on their laptops. Daily totals are small; the motivation is centralized persistence and access, not an established local compute bottleneck.

## Decision

Adopt online user storage with Tiger Data hypertables as the architecture direction and plan its integration. Preserve device-side classification. This supersedes the earlier local-only deployment target in the app/API plans; the no-login scaffold remains a local prototype until hosted-access controls are implemented.

## Consequences

Propose hosted Rails and managed Tiger Cloud, ordinary account/device/canonical-session tables, and an accepted-snapshot hypertable. Atomic writes and canonical revision checks preserve idempotency; daily totals never sum cumulative history rows. These implementation details remain proposals, not evidence of a provisioned service.

Resolve authentication, device enrollment, per-user isolation, region/tier and budget, vetted versions, retention, deletion, and recovery before public rollout. Hosting does not solve missing offline activity or cross-midnight allocation. This planning decision alone does not authorize provisioning or implementation.

## Related documents

- [Hosted storage plan](../data-storage.md)
- [App API contract](../app-api.md)
- [Roadmap](../ROADMAP.md)
