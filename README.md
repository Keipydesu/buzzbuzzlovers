# bbl

Account implementation and operator setup: [MVP authentication](docs/authentication-mvp.md).

A HackGT 13 project by team **bbl**: a small wearable that tracks slouching, paired with a mobile-first web dashboard for daily awareness, weekly history, and gamified progress.

The app now has username/password accounts, saved friend groups, invite links/codes, weekly slouch-share rankings and a separate most-improved highlight. These changes are local and independently reviewed; see [implementation and limits](docs/social-competition-implementation-plan.md). Rankings refresh from saved data, use Monday–Sunday in the configured app timezone, and trust participants. No-data users are unranked.

The dashboard shows saved personal totals. The old synthetic half-hour chart is no longer shown as live data. Browser BLE integration remains unfinished. Tiger DB integration is preserved, including accepted snapshot history. The MVP will be demonstrated locally; deployment is deferred. Muse at `/coach` remains development/test-only and needs local API credentials; no live Muse response has been verified. Historical UI descriptions below describe earlier previews.

**Status: Rails scaffold under review; dashboard preview available; hosted integration in progress.** The current PR contains persistence/API code. The authenticated dashboard at `/` displays saved personal and group totals. A `posture_snapshots` hypertable migration and model exist and are verified against a real Tiger Cloud instance, and accounts, authentication, and administrator-provisioned device ownership are implemented. Browser BLE integration and the live dashboard are not yet complete. The earlier JavaScript prototype has been discarded.

## The idea

Long desk sessions can make it easy to lose awareness of how we sit. We want to help students notice their posture habits through measurable feedback and small, encouraging goals. This is a posture-awareness project, not a medical diagnostic tool; health benefits are not yet validated.

## Decisions so far

- Four-person team.
- ESP32-based wearable, with the exact board and posture sensor still to be selected.
- All posture calculations run locally on the ESP32.
- Bluetooth Low Energy (BLE) transfers calculated results to a nearby laptop browser.
- The web app displays and stores results; it does not classify raw sensor readings.
- Ruby on Rails is the preferred web framework.
- Online user history with Tiger Data hypertables is the chosen storage direction; the managed-cloud integration details remain proposed.
- Mobile-first interface, with laptops used for the initial Bluetooth demo because the team does not have an Android phone.
- Daily slouch frequency and duration, weekly history, and simple gamification are the core app features.

## Proposed data flow

```text
Posture sensor
      |
      v
ESP32: calibration, posture classification, episode timing
      |
      | BLE: calculated results
      v
Laptop browser: connection and live display
      |
      v
Hosted Rails: accounts, ingestion, summaries, rewards
      |
      v
Tiger Cloud (proposed): PostgreSQL sessions + snapshot hypertable
```

The BLE link stays local. The target is hosted Rails with centralized storage, so users need no local database. Cloud saving requires internet access; the browser must distinguish live BLE readings from unsaved data. Read [the Tiger Data integration plan](docs/data-storage.md) for the proposed schema, account boundaries, retention, rollout, and open hosting decisions.

Read [the MVP plan](docs/MVP.md) for scope, the demo flow, proposed workstreams, and open decisions. Read [the roadmap](docs/ROADMAP.md) for how that scope sequences into phases.

Read [the posture and student-health research](docs/posture-health-research.md) for evidence, limits, and the rationale for CS students. The [focused health-tracker interface decision](docs/decisions/004-focused-health-tracker-interface.md) records the agreed simple navy, gold, and white visual direction; layout and game mechanics remain under discussion.

For the software work, read [the app plan](docs/APP_PLAN.md) and [the app API proposal](docs/app-api.md). The [BLE proposal](docs/ble-protocol.md) defines the wearable-to-browser boundary. These describe intended contracts; the scaffold is partial implementation, and hosted storage and account isolation are still planned.

## Development

### Dashboard preview

With the local setup below already prepared, run `bin/rails server -b 127.0.0.1` (or `rails s`) and open [the dashboard](http://localhost:3000). The page uses sample data only and does not query or write tracking records; Rails' normal development database/migration checks still apply.

Use the top-right toggle for light/dark mode; the browser remembers the selection when local storage is available. For UI checks, `/?preview=empty` shows no activity and `/?preview=disconnected` shows a disconnected state. These controls and sample-data labels are intentionally omitted from the visible mockup at the user’s request; all values remain synthetic and nothing is saved. The dashboard is one scrolling page without section navigation: a compact goal strip sits above today’s totals and frequency bars; both charts have expandable data tables. The weekly dashed line is average tracked minutes per recorded day, excluding no-data days. Read [the habit-trend decision](docs/decisions/007-lead-with-habit-trends.md) for timeline data requirements and [the more-than-one-minute rule](docs/decisions/006-one-minute-slouch-qualification.md) for episode qualification. No extra dependencies or stylesheet watcher are needed for the preview's plain CSS. The goal and milestones illustrate [the subtle gamification direction](docs/decisions/005-subtle-gamification.md); real tracking and saving remain future integration work.

Direct model/schema/migration review confirmed that this preview needs no data-model changes. UI preview work does not establish hardware or hosted-service readiness.

Preview validation (September 26, 2026): `bundle check`, Ruby/route RuboCop checks, and Rails template rendering passed. Booted with `env -u DATABASE_URL bin/rails server -b 127.0.0.1 -p 3001 -P tmp/pids/ui-preview.pid` for browser checks. Verified both themes, theme persistence on reload, all four preview states, the data table, and responsive layout at 390px and 320px (no horizontal overflow at 320px). No new dependencies were installed and no database test suite or hardware checks were run for this visual change.

Latest UI revision: daily episode bars now lead the page, weekly tracked-time bars include a mean across recorded days, and the header uses `bbl` with no sidebar navigation. Browser checks covered populated and empty charts, both themes, and 320px layout; RuboCop (`--cache false`) and whitespace checks passed. The more-than-60-second rule is documented for firmware implementation, not enforced by this mockup.

### Local setup

Use established, security-reviewed gems and other dependencies. Avoid brand-new packages and releases without substantial independent scrutiny, and review provenance, advisories, and transitive changes before adoption. See [the dependency safety policy](docs/dependency-safety.md) for required checks and review evidence.

Local setup was verified with rbenv Ruby 3.3.12, Rails 8.1.4, and PostgreSQL 14. Run commands from the repository root with local PostgreSQL running and no hosted `DATABASE_URL` set:

```sh
bundle check
bin/rails db:prepare
bin/rails tailwindcss:build
bin/rails server -b 127.0.0.1
```

Check [the health endpoint](http://127.0.0.1:3000/up). Run `bin/rails test` against the local test database. For live stylesheet updates, run `bin/rails tailwindcss:watch` in a second terminal. These commands do not require Foreman; the scaffold's `bin/dev` attempts to install it if missing.

Each rbenv Ruby version has its own installed gems. On a fresh Ruby installation, install the reviewed lockfile with `BUNDLE_FROZEN=true bundle install`, then run `rbenv rehash`. The September 26, 2026 local setup used an explicitly authorized one-time exception to install the existing locked dependencies; this is not a completed dependency security review. All 41 existing tests passed (120 assertions).

The hosted integration remains partial; these commands prepare local development and test databases only.

### Tiger Cloud hypertable (posture_snapshots)

Copy `.env.example` to `.env` and fill in `TIGER_DATABASE_URL` (never commit `.env`; see [dependency safety](docs/dependency-safety.md) — no new gem was added for this, `config/boot.rb` has a small inline loader). Normal local commands above are **unaffected** and keep using local PostgreSQL; Tiger Cloud requires explicitly opting in per command:

```sh
set -a; source .env; set +a
DATABASE_URL="$TIGER_DATABASE_URL" bin/rails db:migrate
```

`db/migrate/..._create_posture_snapshots.rb` converts the table to a TimescaleDB hypertable when the `timescaledb` extension is present (verified against Tiger Cloud, PostgreSQL 18.6 / TimescaleDB 2.30.1 as of September 26, 2026) and otherwise creates an ordinary table, so the same migration and model are exercised by the local Minitest suite (`bin/rails test`, unaffected, no `DATABASE_URL` needed) and by Tiger Cloud. `config.active_record.dump_schema_after_migration` is disabled (`config/application.rb`) specifically because this dual-target setup would otherwise bake Tiger Cloud's extensions into the committed `db/schema.rb` and break local `db:test:prepare`; run `bin/rails db:schema:dump` explicitly (with `DATABASE_URL` unset) after a local migration to update it.

This is implementation-sequence step 4 from [data-storage.md](docs/data-storage.md) — the hypertable and `Snapshots::Ingest` history writes only, verified end-to-end (accepted snapshot → session row → one history row in an actual hypertable chunk) against an isolated Tiger Cloud dev instance with `sslmode=require`. Account ownership now lives on devices and canonical sessions. History remains linked through its canonical session. TLS certificate verification and the remaining operational gates must match the deployed service configuration; they were not revalidated against live data in this integration.

## Browser constraint

Web Bluetooth requires a compatible browser and secure context. Plan to test the exact laptop OS/browser combination early. Chrome documents support on macOS, Windows, ChromeOS, and Android, with additional restrictions for Linux. Safari does not support Web Bluetooth, so a mobile-first layout does not imply iPhone Bluetooth support.

References: [Chrome Web Bluetooth documentation](https://developer.chrome.com/docs/capabilities/bluetooth), [MDN compatibility](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API#browser_compatibility).

The [compact mobile layout](docs/decisions/009-compact-goal-above-today.md) removes the overview introduction and keeps today’s totals visible without scrolling at 320 × 568.

The goal now illustrates [slouch reduction](docs/decisions/010-reward-slouch-reduction.md), comparing slouch share with previous recorded days. Its 20% target is provisional; the older tracking-duration API challenge is not connected to the mockup.



### Local MVP demo

The immediate target is a loopback-only demo, not production deployment. See [local demo setup](docs/local-demo.md). The merged Tiger DB/hypertable implementation remains available when explicitly selected; local development and tests use ordinary PostgreSQL. Production Docker/Kamal configuration is deferred.
