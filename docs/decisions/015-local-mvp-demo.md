# 015 — Prioritize a local MVP demo

Date: 2026-09-26.

Status: accepted scope adjustment.

## Context

After requesting integration with the new Tiger DB work and a production build, the operator chose to keep the MVP demo local and avoid further investment in the production environment.

## Decision

Finish merging the reviewed accounts/competition work with main's Tiger history integration. Demonstrate the app on loopback using local PostgreSQL, with Tiger available through explicit connection configuration. Defer further production configuration, provisioning and deployment. This refines the immediate delivery scope; it does not discard the online-storage direction in decision 003.

## Consequences

Keep canonical sessions plus accepted-revision history. Local PostgreSQL stores history as an ordinary table; Timescale-enabled targets retain hypertable migration/bootstrap behavior. Do not test against live data. A production image was built during the earlier scope, but no live database operations or deployment occurred, and its uncommitted production configuration extras are excluded from this integration.

## Related documents

- [Online storage direction](003-online-storage-with-tiger-data.md)
- [Local demo](../local-demo.md)
- [Competition implementation](../social-competition-implementation-plan.md)
