# Local MVP demo

The MVP target is a local demonstration, per [decision 015](decisions/015-local-mvp-demo.md). Accounts, group creation, link/code joining, weekly rankings and most-improved are implemented. The Tiger history integration is retained; deployment work is deferred.

## Run locally

Use the pinned Ruby/gems and local PostgreSQL. Set the environment explicitly so an optional `.env` cannot redirect local commands to hosted data:

```sh
bundle check
SKIP_DOTENV=1 RAILS_ENV=development DATABASE_URL=postgresql://127.0.0.1:5432/bbl_demo_development bin/rails db:prepare
SKIP_DOTENV=1 RAILS_ENV=development DATABASE_URL=postgresql://127.0.0.1:5432/bbl_demo_development bin/rails tailwindcss:build
SKIP_DOTENV=1 RAILS_ENV=development DATABASE_URL=postgresql://127.0.0.1:5432/bbl_demo_development bin/rails server -b 127.0.0.1 -p 3107
```

If the shell already has `PRIMARY_DATABASE_URL` or PostgreSQL service/host overrides, unset them first as in the test command below. Visit `http://127.0.0.1:3107/signup`, create an account and group, then open its invite link in another browser session or log out and create a second account. Joining requires a button/code submission; simply opening a link never joins.

Bind a wearable as the operator using the [account setup command](authentication-mvp.md). Device ownership cannot be claimed publicly or transferred implicitly. Existing unowned tracking history remains unowned. There are no seeded real credentials or personal records.

## Tiger support stays intact

The merged migration creates `posture_snapshots` and converts it to a hypertable when TimescaleDB is present. The schema bootstrap hook is retained. Accepted ingestion updates the canonical session and writes history in one transaction; retries do not add history. Competition and personal totals use canonical sessions, not sums of cumulative snapshot history.

To use the existing Tiger service deliberately, supply its URL as `DATABASE_URL` through the environment, following its existing secret/TLS setup. Do not run the test suite against that live connection. This merge does not change Tiger credentials, settings or records.

## Verification

```sh
env -u PRIMARY_DATABASE_URL -u PGHOST -u PGSERVICE -u PGSERVICEFILE -u PGDATABASE -u PGUSER -u PGPASSWORD SKIP_DOTENV=1 RAILS_ENV=test DATABASE_URL=postgresql://127.0.0.1:5432/bbl_competition_test_20260926 PARALLEL_WORKERS=1 bin/rails test
bin/rubocop --cache false
```

The integration schema was generated from all five combined migrations on the disposable local database. It now legitimately includes snapshot history alongside account/group tables; no generated model-map task exists. The earlier isolated auth review's orphan-table issue was a cross-branch local database mismatch, not grounds to remove the now-merged history migration.

Local tests skip the Timescale-only bootstrap check when the extension is absent. Brakeman reports one upstream SQL-interpolation warning in `HypertableSetup`; identifiers and literals are quoted and inputs are fixed definitions/database metadata. No warning suppression was added.

Browser BLE integration and physical tracker verification remain separate work. The dashboard shows saved data; it does not invent half-hour activity or silently classify posture in Rails.

Final integration verification: 90 tests / 354 assertions passed, with one expected Timescale-only skip; RuboCop 81 files clean. Claude independently repeated these checks and approved the merge. Fresh local `bbl_demo_development` schema bootstrap and signup rendering also passed. No live Tiger data was accessed or changed.
