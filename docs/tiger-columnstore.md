# Tiger connection and snapshot compression

`bin/tiger-storage` reads the existing `TIGER_DATABASE_URL` from `.env` without
printing it. It uses the already-installed `pg` gem; it does not boot Rails,
run migrations/seeds, or redirect the application's database connection.

Paste Tiger's PostgreSQL connection string into `TIGER_DATABASE_URL`. If its
Connect screen supplies a separate database password, `TIGER_DATABASE_PASSWORD`
overrides the URL's password for this tool only; leave it blank when the URL already
contains the password. REST API access/secret keys are different credentials and
cannot authenticate a PostgreSQL connection. Ordinary Rails connections still
require a complete `DATABASE_URL` with its password.

## Verify the connection

```sh
bin/tiger-storage status
```

This opens a read-only database connection and reports TLS, PostgreSQL/TimescaleDB
versions, the `public.posture_snapshots` hypertable, compressed chunk counts, and
its background policies. It does not select personal tracking records.

Certificate and hostname verification are required even if the URL says
`sslmode=require`. With libpq 16+ (this machine has 18), use the system trust store:

```dotenv
TIGER_SSLROOTCERT=system
```

No separate certificate file is normally needed. Tiger's [official SSL guide](https://www.tigerdata.com/docs/use-timescale/latest/security/strict-ssl/)
says services start with a self-signed certificate; paid services usually receive
a signed certificate within 30 minutes. Free services do not supply signed
certificates. For a new paid service, wait for certificate issuance and retry.
For a free service, strict verification may remain unavailable: resolve trusted
certificate provisioning or explicitly decide on a different TLS policy before
using this tool. It does not silently fall back to encryption without server
identity verification.

An existing, independently trusted CA bundle can instead be supplied as an
absolute file path. Do not put a password, API key, or pasted certificate body
in this variable, and do not trust a certificate solely because the failing
endpoint returned it.

## Verify compression without changing application records

Once status succeeds and the existing snapshot hypertable is prepared:

```sh
bin/tiger-storage verify-columnstore
```

This requires schema-creation privileges and TimescaleDB 2.18+. It creates a
random scratch schema inside one transaction, clones the snapshot table definition,
inserts 10,000 synthetic revisions, compresses its chunks, and verifies identical
row content, duplicate protection, append/delete behavior, and policy idempotency.
The transaction always rolls back, including the scratch schema and policy.
It neither runs Rails fixtures nor inserts into application tables. It consumes
a small amount of temporary database work and takes no application-table write lock.

## Enable the policy

Run the synthetic verification successfully on the target service before enabling
the real policy; hosted SQL compatibility is not yet verified for this PR.

```sh
bin/tiger-storage enable-columnstore
bin/tiger-storage status
```

The explicit enable command requires the existing public snapshot hypertable;
it does not create or migrate application tables. It configures:

- Segmenting by `posture_session_id`, ordering by `received_at DESC`.
- Automatic conversion of chunks entirely older than seven days.
- No retention/deletion and no change to canonical sessions or account tables.

The enable command is transactional, bounds lock waits to five seconds, and
refuses to replace a policy with a different age or a paused policy. Repeating
the same setup keeps a single policy. Existing columnstore chunk layouts are not
rewritten; configured segment/order settings apply to future conversions.

Seven days is an initial default, not a measured optimum. Compression eligibility
uses whole chunk ranges, so even seven-day-old rows can remain uncompressed until
their entire chunk qualifies. Small demo data may show no meaningful space saving.
The script does not force-convert existing application chunks or change their
interval. Keep all totals derived from `posture_sessions`, not cumulative history.

The current docs mix `segmentby`/`orderby` and `compress_segmentby`/`compress_orderby`
spellings. [TimescaleDB 2.18 source](https://github.com/timescale/timescaledb/blob/2.18.0/src/compression_with_clause.c)
defines both as aliases; this tool uses the modern names. Still run the scratch
probe against the actual target version before enabling the real policy.

To pause future conversion, inspect the policy's job ID in status and use
`SELECT alter_job(<job_id>, scheduled => false);` through your database console.
This does not decompress or delete existing data. Re-enabling that paused policy
is a deliberate operator action; the setup command refuses to silently resume it.

## Verification record — 2026-09-27

Direct model, schema, migration, and hypertable-bootstrap review confirmed that
accepted revisions already have a separate hypertable path. Canonical sessions
remain ordinary PostgreSQL. No Active Record schema change is needed.

The supplied Tiger URL was tested with full TLS validation. Both system roots and
the installed OpenSSL CA bundle failed; a credential-free TLS handshake reported
`self-signed certificate in certificate chain`. No database credentials were sent
after validation failed, and no hosted data, schema, or policy was changed.
Hosted status, synthetic compression, and policy activation remain unverified
until server certificate trust is resolved. After the operator updated `.env`, the configured
CA value did not resolve to an existing local file; a dedicated preflight error now
explains this without echoing the value. Local checks are not proof of hosted compression.

Local verification: 11 Rails tests / 30 assertions passed, with the expected
Timescale-only bootstrap skip on ordinary PostgreSQL; targeted RuboCop passed
on the operator script, library, and new tests. The tests cover enforced TLS,
read-only defaults, refusing unsupported databases, and existing ingestion behavior.
The existing scratch-bootstrap test explicitly disables development demo seeds.

References: [decision 032](decisions/032-tiger-snapshot-columnstore.md),
[columnstore setup](https://www.tigerdata.com/docs/build/columnar-storage/setup-hypercore),
[policy API](https://www.tigerdata.com/docs/reference/timescaledb/hypercore/add_columnstore_policy),
[ALTER TABLE](https://www.tigerdata.com/docs/reference/timescaledb/hypercore/alter_table).

Follow-up: the official SSL guide explains that free services lack signed
certificates and new paid services can need 30 minutes. Retrying explicitly with
`TIGER_SSLROOTCERT=system` still failed. The service plan/age is not yet confirmed;
the operator does not necessarily have or need a separate CA file.
