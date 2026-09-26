# bbl

A HackGT 13 project by team **bbl**: a small wearable that tracks slouching, paired with a mobile-first web dashboard for daily awareness, weekly history, and gamified progress.

Saved for a future iteration: [friend-group competition as a major app experience](docs/decisions/011-social-competition-direction.md), with rankings and an ergonomics-helper idea. Further implementation is paused; scoring and group behavior remain open.

The current working UI includes a competition section, a synthetic leaderboard at `/groups`, and an unfinished Muse page at `/coach`. Group creation only changes the preview URL; it does not save memberships or send invitations. Muse is restricted to development/test and requires local `META_MUSE_API_KEY` and `META_MUSE_MODEL` environment variables; no live API call has been verified. Keep credentials out of source control. Earlier UI descriptions below record prior iterations. Before this commit, Ruby lint checks and local Rails GET rendering checks for `/`, `/?preview=empty`, `/groups`, and `/coach` passed; these checks do not validate real competition or AI responses.

**Status: Rails scaffold under review; dashboard preview available; hosted integration planned.** The current PR contains persistence/API code. A sample-data dashboard is available at `/`. Browser BLE integration, the live dashboard, and Tiger Data integration are not yet complete. The earlier JavaScript prototype has been discarded.

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

The hosted integration remains planned; these commands prepare local development and test databases only.

## Browser constraint

Web Bluetooth requires a compatible browser and secure context. Plan to test the exact laptop OS/browser combination early. Chrome documents support on macOS, Windows, ChromeOS, and Android, with additional restrictions for Linux. Safari does not support Web Bluetooth, so a mobile-first layout does not imply iPhone Bluetooth support.

References: [Chrome Web Bluetooth documentation](https://developer.chrome.com/docs/capabilities/bluetooth), [MDN compatibility](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API#browser_compatibility).

The [compact mobile layout](docs/decisions/009-compact-goal-above-today.md) removes the overview introduction and keeps today’s totals visible without scrolling at 320 × 568.

The goal now illustrates [slouch reduction](docs/decisions/010-reward-slouch-reduction.md), comparing slouch share with previous recorded days. Its 20% target is provisional; the older tracking-duration API challenge is not connected to the mockup.
