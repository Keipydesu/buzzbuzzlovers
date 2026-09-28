# Hosted storage and Tiger Data integration


Current follow-up: [decision 017](decisions/017-ten-second-slouch-grace.md) replaces the one-minute rule with ten-second qualification/full-candidate credit and three-second reset. [Decision 018](decisions/018-mvp-first-connection-registration.md) replaces mandatory manual provisioning with trusted first-use registration for MVP. Existing ownership remains protected; stronger enrollment is still required for an untrusted public rollout. Historical proposals below yield to these decisions.

Current integration reference (2026-09-26): [hardware integration plan](hardware-integration-plan.md), [BLE source contract](ble-protocol.md), and [current API](app-api.md). Firmware now exists under `Hardware/`; accounts, ownership, canonical sessions, and atomic accepted history are implemented in Rails. The immediate target is the local demo; the browser adapter is implemented with automated fixture coverage; physical device validation remains pending. Historical proposals below are superseded where they describe absent hardware/accounts/history or public hosting as the immediate milestone.

**Status: integration proposal, not implemented.** The confirmed direction is online storage for users with Tiger Data hypertables. Recommend managed Tiger Cloud PostgreSQL with TimescaleDB and hosted Rails; provider tier, region, Rails host, authentication implementation, versions, and retention settings remain open. This supersedes the local-only deployment target in earlier plans. The existing no-login scaffold remains a local prototype until the gates below pass.

## Purpose and boundaries

Users should not need to run a database or retain their long-term history on their laptop. Rails handles persistence and summary queries centrally; the browser handles BLE, live display, and a bounded unsaved queue. Daily/session totals are small, so this plan does not claim that ordinary daily metrics require significant local compute or that hypertables are necessary for that volume. The reasons for hosting are durable centralized history, managed operations, and access across devices. The hypertable adds time-indexed accepted-snapshot history, which has a separate storage cost.

```text
ESP32: classify posture and calculate cumulative counters
  -> local BLE -> laptop browser: display + bounded upload queue
  -> HTTPS -> hosted Rails: authenticate, authorize, reconcile
  -> verified TLS -> Tiger Cloud PostgreSQL / TimescaleDB
       ordinary tables: users, devices, posture_sessions
       hypertable: posture_snapshots (accepted revisions)
```

The browser never connects to the database or receives database credentials. Neither Rails nor Tiger Data classifies raw sensor readings. Hosting does not recover snapshots the wearable no longer retains or make saving work without an internet connection. Keep the upload queue and truthful unsaved state from [app-api.md](app-api.md); its current in-memory queue is lost on reload. A durable browser outbox is a separate proposal.

TimescaleDB is a PostgreSQL extension compatible with PostgreSQL clients and SQL. Use Rails' existing ActiveRecord PostgreSQL adapter and `pg`, subject to [dependency review](dependency-safety.md), with reviewed SQL migrations for extension objects. No new Timescale wrapper gem is required by this plan. Select supported, vetted PostgreSQL/TimescaleDB versions before choosing migration syntax; do not copy newest-version examples blindly. [Tiger Data overview](https://www.tigerdata.com/docs)

## Proposed data model

| Table | Storage | Responsibility |
| --- | --- | --- |
| `users` | Ordinary PostgreSQL | Authenticated account and configured IANA timezone |
| `devices` | Ordinary PostgreSQL | Globally unique wearable identity and verified owner |
| `posture_sessions` | Ordinary PostgreSQL | Canonical latest cumulative state, frozen owner and calendar metadata, unique `(device_id, device_session_id)` |
| `posture_snapshots` | Time-partitioned hypertable | One row per accepted revision after history capture is enabled |

Add a server-derived `user_id` to devices and sessions. Session ownership remains immutable; device transfers and sharing are out of scope for this first hosted version. Enforce consistent device/session ownership with constraints where practical and authorization in every application path. Do not accept `user_id` or owner IDs in snapshot bodies.

Proposed hypertable fields: `received_at timestamptz NOT NULL`, `user_id`, `posture_session_id`, and the six canonical snapshot fields (`protocol_version`, `state`, `sequence`, `tracked_seconds`, `slouch_seconds`, `episode_count`). Use the session's same numeric bounds and state/counter checks. Derive owner and session keys on the server. `received_at` is the server's acceptance time, not when posture activity happened; preserve the session's separate frozen `first_observed_at`, `calendar_day`, and `calendar_timezone`.

Partition on `received_at` only initially. Proposed primary key: `(received_at, posture_session_id, sequence)`; indexes for `(user_id, received_at DESC)` and `(posture_session_id, sequence)` support authorized history queries and troubleshooting. The latter is non-unique. Choose chunk interval from measured ingestion and index size, not a hardcoded per-user or per-day partition.

Hypertable unique indexes must include every partition column, so a unique `(posture_session_id, sequence)` alone cannot enforce cross-time idempotency here. Do not convert `posture_sessions` into a hypertable or weaken its existing global session uniqueness. Keep the ordinary session row as the reconciliation authority. Do not allow updates to the partition timestamp. [Hypertable limitations](https://www.tigerdata.com/docs/deploy/limitations)

## Atomic ingestion and retry behavior

Keep the v1 snapshot JSON and ordered dispositions in [app-api.md](app-api.md). Authenticate and resolve device ownership before accessing its state. Within one database transaction and connection:

1. Lock the canonical session row, or create it with the existing unique-index race retry. Freeze the authenticated owner, first observation, and calendar bucket on first creation.
2. Apply validation and the accepted/duplicate/stale/conflict/ended/regression rules. Rejected, stale, and duplicate requests create no history rows and do not advance receipt timestamps.
3. For an accepted revision, update/create the session and insert its snapshot history row, using the same server acceptance timestamp for both. If either write fails, roll back both. Return success only after commit.

The session lock and persisted sequence prevent a retry with a different receipt time from creating another history row. All writers, including import jobs, must use this path; the hypertable's time-inclusive key alone is insufficient. Preserve canonical session records when expiring snapshot history so old requests cannot recreate sessions or rewards. Account deletion must revoke access before removing its records; define any minimal replay-protection records separately from retained personal history.

Accepted history is sampled: the browser coalesces uploads, and lower revisions arriving late are discarded. It is not every BLE heartbeat or a complete activity timeline. Existing sessions can continue at their next accepted revision; do not fabricate older history during migration.

## Daily metrics and calendar semantics

Continue querying canonical `posture_sessions`, scoped to the authenticated user, for Today, Weekly, and challenges. Sum each session once. Compute counts and sums in one aggregate statement per response dataset to avoid totals from different concurrent revisions; group the weekly query by saved calendar date and fill empty dates in Rails.

Never sum cumulative fields across `posture_snapshots`: revisions 60 and 90 tracked seconds represent 90 total, not 150. Do not add continuous aggregates over those counters for daily totals. Keep rewards derived from canonical saved totals rather than awarding points per upload.

The profile timezone comes from the authenticated account; a session freezes it at creation. Keep the label “Sessions by first-seen date.” Neither server receipt buckets nor a hypertable reconstructs cross-midnight activity or unseen offline sessions. Accurate activity-per-day requires firmware time-bucketed history or another explicitly designed measurement contract. Changing a user's timezone must not move old session buckets.

## Hosted access and operations gates

- Choose and implement account authentication before any public deployment. Keep browser and Rails on one HTTPS origin, Rails CSRF protection, secure session cookies, and explicit session expiry. Missing authentication returns `401`; non-owned devices return `404` without revealing another user's state.
- Define a proof-of-possession enrollment flow before enabling device registration online. Knowledge of a public BLE device ID is not ownership proof. Until this is implemented, use administrator-provisioned bindings for a closed pilot; never let a logged-in user claim an arbitrary ID by being first to POST it.
- Scope every device list, session read, ingestion request, summary, and future history endpoint to the current user. Define export and deletion for both ordinary tables and the hypertable; expiration of snapshot chunks is not account deletion.
- Store database credentials only in server secrets. Use a least-privilege application role and a separate migration role. Require TLS certificate and hostname validation (`sslmode=verify-full` with the appropriate trusted CA); test that invalid certificates fail. [PostgreSQL TLS documentation](https://www.postgresql.org/docs/current/libpq-ssl.html)
- Select Rails hosting and database region together. Bound connection pools across web workers and jobs, set timeouts, and review any managed pooler's compatibility with transactions and prepared statements before enabling it. Map the scaffold's primary/cache/queue/cable database configuration deliberately; do not assume one cloud connection URL configures all four stores.
- Separate production, development, test, and synthetic-demo records and credentials. Never point destructive Rails test setup at the hosted production database. Verify migrations and extension objects with a compatible disposable TimescaleDB database; use SQL schema dumps if Rails' schema dumper cannot preserve those objects, and test a clean restore.
- Set backup/restore expectations, credential rotation, monitoring for failed saves and database capacity, and a budget before provisioning. Region, service size, backup retention, recovery targets, and billing owner need team decisions; this document creates no service or paid resource.

## History volume and lifecycle

The user has now requested snapshot compression. [Decision 032](decisions/032-tiger-snapshot-columnstore.md)
advances this previously deferred work through explicit operator tooling; see
[verification and rollout](tiger-columnstore.md). This does not enable deletion,
change session storage, or establish that the hosted policy has been activated.

For sizing, assume at most one normal accepted upload per second while tracking, plus terminal uploads. Eight connected hours yields about 28,800 history rows per wearer per day (100 wearers: about 2.88 million), before terminal events and any replay bursts. Measure actual coalescing, bytes per row plus indexes, active users, and connection usage before selecting a tier or claiming savings.

Choose snapshot retention separately from session-summary retention and account deletion. Disable automatic deletion until the team agrees a duration and restore behavior is tested. If retaining all accepted revisions is too costly, revise the capture cadence explicitly and label the history as sampled; do not silently drop unsaved terminal data.

Columnstore/compression and retention jobs are later, measured optimizations, not prerequisites for correct ingestion. Verify their APIs against the vetted extension version and test deletion/export on older data. Continuous aggregates remain optional for future non-cumulative analytics. If introduced, coordinate their refresh windows with source retention: refreshing a range whose source was deleted can remove its aggregate history. [Continuous aggregate retention interaction](https://d1ovb29l12vjqm.cloudfront.net/use-timescale/latest/continuous-aggregates/refresh-policies/)

## Implementation sequence and acceptance checks

1. Confirm Rails host, Tiger Cloud region/tier and budget, authentication/enrollment design, retention, and vetted versions. Resolve the existing PR review findings before building on ingestion and summaries.
2. Provision an isolated development database and validate verified TLS, extension availability, role permissions, migration syntax, SQL dump/restore, and connection limits. Record actual commands and audit evidence; no new gem without dependency review.
3. Add accounts and ownership migrations. Assign existing demo devices to an explicit demo account with audited mapping; do not infer owners. Preserve session IDs, counters, frozen timestamps, and calendar dates. Test cross-account denial and registration races.
4. Add the empty hypertable and transactional accepted-revision writes. Test simultaneous first inserts, competing revisions, duplicate and ended retries, lost responses after commit, and injected history-write failure. Assert canonical/history consistency and unchanged totals on retry.
5. Connect authenticated hosted Rails and browser uploads. Test BLE connected while internet/database saving fails, retry recovery, logout with queued data, and reload from a second authenticated browser. Pending data must never be reassigned to a different logged-in user.
6. Validate Today/Weekly and challenge totals against canonical fixtures, concurrent ingestion, timezone boundaries, and history expiration. Test backup restore and account deletion in both stores. Measure volume and query latency before enabling retention or columnstore policies.

Roll out to a closed pilot first. A rollback may disable history capture while preserving canonical writes and the new tables; record the resulting history gap. Do not silently switch users to a separate local database or drop saved cloud data. Changing the public authentication contract requires a documented client rollout; a local unauthenticated prototype must never be exposed as the rollback target.
