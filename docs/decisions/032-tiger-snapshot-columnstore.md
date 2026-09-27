# 032 — Compress accepted snapshot history in Tiger Data

Date: 2026-09-27.

Status: accepted user request; seven-day policy is an implementation default.

## Context

The user supplied a Tiger connection and requested verification, hypertable
compression, and a PR. Existing migrations/bootstrap establish the snapshot
hypertable, but do not enable columnstore or schedule compression. This advances
the compression work previously deferred in the storage plan.

## Decision

Use TimescaleDB's columnstore APIs (2.18 or newer) for `public.posture_snapshots`.
Segment by `posture_session_id`, order by `received_at DESC`, and schedule conversion
of chunks whose entire time range is older than seven days. Keep the current chunk
interval; tune it after measuring actual traffic. No deletion/retention policy.

Provide explicit operator commands for read-only status, a rollback-only synthetic
compression probe, and enabling the policy. Do not run hosted migrations, seeds,
Rails fixtures, or compression automatically at app startup. Preserve existing
policies with different ages by refusing to replace them silently.

## Consequences

Canonical sessions, accounts, and groups remain ordinary PostgreSQL tables.
Daily/weekly totals continue using canonical sessions, never summed snapshot
revisions. Compression is reversible storage conversion, not data deletion.
Recent chunks stay in rowstore; small datasets may see no immediate savings.

Connections require certificate and hostname verification with a trusted CA.
The first connection attempt failed with a self-signed certificate in the chain;
hosted verification and activation remain pending resolution of certificate trust.
Follow-up from Tiger’s official SSL guide: modern clients normally need no CA file;
new paid services can take 30 minutes to receive a signed certificate, while free
services do not supply one. The service plan/age is not yet confirmed.
Direct model/schema/migration review found no Active Record schema changes needed.
No dependency installation or generated model-map task is involved.

## Related documents

- [Storage plan](../data-storage.md)
- [Online storage direction](003-online-storage-with-tiger-data.md)
- [Tiger verification and compression](../tiger-columnstore.md)
- [Columnstore setup](https://www.tigerdata.com/docs/build/columnar-storage/setup-hypercore)
