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

Browser BLE integration is implemented; physical tracker verification remains separate work. The dashboard separates live wearable readings from saved data; it does not invent half-hour activity or classify posture in Rails.

Final integration verification: 90 tests / 354 assertions passed, with one expected Timescale-only skip; RuboCop 81 files clean. Claude independently repeated these checks and approved the merge. Fresh local `bbl_demo_development` schema bootstrap and signup rendering also passed. No live Tiger data was accessed or changed.

## Browser BLE integration

The signed-in dashboard now connects a real Web Bluetooth transport to the existing snapshot API. The operator must provision the BLE identity first; a device POST only checks that binding. Connect on a user click, press the physical BOOT button upright, and observe live readings and saving status separately. Slouch time includes short leans, while episode count requires more than one minute. No normal end command exists; disconnected/rebooted sessions remain incomplete with their saved totals.

Software checks use the existing installed tools, without new packages:

```sh
npm run test:ble
npm run test:e2e
bin/rubocop --cache false
```

The browser suite uses the dedicated `bbl_playwright_test` database and loopback port 3118, with external requests blocked. Its `/?ble_fixture=1` mode is rendered only when Rails is in test mode with `BBL_E2E=1`; the test entrypoint verifies database isolation. The banner explicitly marks simulated data. Native transport tests use fake GATT objects to exercise subscription/read ordering, disconnect, and stale callback cancellation. No test contacts a real wearable or live hosted database.

Remaining physical checks: record exact ESP32 board, BNO055 mounting, firmware/core/library versions, and laptop/OS/browser; capture identity and 20-byte notifications; exercise BOOT, below/exactly/above-60-second leans, sensor errors, held-button staleness, reconnect recovery, and power-off loss. Device firmware is unchanged. A responsive browser passing simulated tests does not mean it supports Web Bluetooth.

The queue is in memory. Disconnect preserves pending data while the page stays open; navigation/reload/closure can lose it. Warnings are best effort, not durable storage. Queue capacity is 100 sessions with a visible overflow warning; it cannot stop hardware tracking. Retry honors server Retry-After. Cross-tab account changes pause the uploader, and server-owned device bindings prevent writes being reassigned to a different account.

Implementation verification (2026-09-26): 21 Node tests passed; the full four-project browser suite passed 92/92; Rails passed 91 runs / 377 assertions with one expected Timescale-only skip on isolated local `bbl_ble_test_20260926`; RuboCop checked 84 files with no offenses. Browser failures found during development (detached timer binding and a test's unawaited logout) were corrected and rerun. A summary-refresh race has a regression case. Final device-switch and theme-rendering checks passed 8/8 across all four browser projects after the full suite.

Reviewed mobile screenshots use visibly labeled synthetic data: [dark theme](screenshots/ble-mobile-dark.png), [light theme](screenshots/ble-mobile-light.png). Capture waits for the theme's color transition to finish; an intermediate frame is not accepted as visual QA. Physical sensor/BLE verification is still pending.
