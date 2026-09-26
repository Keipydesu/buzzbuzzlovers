# Repository Guidelines

## Before Planning or Changing Anything

Read the decisions first. Keep one decision per numbered file in `docs/decisions/`, named `NNN-short-slug.md`; do not maintain a separate index. Search by topic, then read every decision relevant to the proposed change:

```sh
rg -il '<topic>' docs/decisions/
```

Each decision records its date, status, context, decision, consequences, and related documents. Distinguish accepted direction from proposed implementation details. Use the next unused number. To change an accepted decision, add a superseding record and link both records rather than silently rewriting history.

Read [the roadmap](docs/ROADMAP.md) for phases, current priorities, deferred work, and release blockers. Check actual code and review status before treating a checklist item as landed. A plan that has not reviewed relevant decisions, the roadmap, and the current data model is not ready to propose.

Inspect `app/models/`, `db/schema.rb`, and migrations for the current data model. This repository does **not yet** have a generated Active Record model map or the `agents:data_model` / `agents:data_model:check` tasks. Do not claim to have run them or hand-write a block labeled as generated. If implemented later, use the generated block in this file, never edit it by hand, regenerate it with `bin/rails agents:data_model` after model/schema changes, and verify it with `bin/rails agents:data_model:check`. Until then, record a direct model/schema review and runtime limitations.

Also read relevant existing documents: [README](README.md) for status and workflow, [MVP](docs/MVP.md) for scope, [app plan](docs/APP_PLAN.md) for architecture, [app API](docs/app-api.md) and [BLE protocol](docs/ble-protocol.md) for contracts, [hosted storage](docs/data-storage.md) for integration, and [dependency safety](docs/dependency-safety.md) before dependency changes. Do not assume documents, roadmap section numbers, or commands from another repository exist here.

## Project Structure & Module Organization

The current PR includes a Rails persistence/API scaffold under `app/`, `config/`, `db/`, and `test/`. `README.md` introduces the project; `docs/MVP.md` records scope, architecture, acceptance criteria, and open decisions. Keep planning documents in `docs/` and link important additions from the README. Hosted storage and browser BLE/dashboard integration remain planned.

## Architecture & Scope

The ESP32 performs calibration, posture classification, and episode timing locally. BLE transfers calculated results to a laptop browser; the proposed Rails app stores sessions and displays daily totals, weekly history, and rewards. Do not move posture classification into the browser or backend.

Rails is the preferred framework. Online user storage with Tiger Data hypertables is the chosen direction; follow [the integration plan](docs/data-storage.md). Keep canonical sessions in ordinary PostgreSQL tables and accepted snapshot history in a separate hypertable. Account authorization is required before public deployment. Exact hosting, versions, retention, and hardware choices remain open. Keep proposals distinct from implemented behavior. Planning requests do not authorize provisioning, application implementation, or restoring the discarded JavaScript prototype.

## Dependency Safety

Use only established dependencies whose provenance, maintenance history, and security have been reviewed. This applies to Ruby gems, their transitive dependencies, and any JavaScript/npm packages or other third-party libraries introduced later. Do not choose brand-new packages or newly released versions without substantial independent scrutiny merely because they are latest or convenient. A familiar name, download count, or clean vulnerability scan alone does not establish safety.

Follow [the dependency safety policy](docs/dependency-safety.md) before installing, adding, or updating dependencies. Prefer supported, vetted versions; record review evidence in dependency PRs, commit lockfiles, and inspect transitive changes. If safety cannot be established, do not install or adopt the dependency. Security fixes require prompt review rather than a blanket waiting period.

## Build, Test, and Development Commands

The scaffold supplies Rails commands, but setup and execution must be verified against its pinned Ruby, gems, and an isolated database before claiming checks pass. Never run tests against hosted user data. For documentation changes, run:

- `git status --short` — inspect changed and untracked files.
- `git diff --check` — detect whitespace errors in tracked changes.
- `git diff --cached --check` — check newly added files after staging.

Verify relative Markdown links manually. Document actual setup and execution commands when implementation begins.

## Coding Style & Naming Conventions

Use descriptive Markdown headings, short paragraphs, and fenced code blocks for commands or payload examples. Use relative links, such as `docs/MVP.md`. Prefer descriptive filenames such as `docs/ble-protocol.md`. Keep indentation consistent within lists and examples.

Follow the Rails scaffold conventions and its RuboCop configuration for application changes; verify tool availability before reporting lint results.

## Testing Guidelines

The scaffold uses Rails Minitest; no coverage target is set. Use `docs/MVP.md` and `docs/data-storage.md` as acceptance checklists. Cover duplicate transfers, reconnects, stale readings, persistence, aggregation, account isolation, and atomic session/history writes. Report missing runtime prerequisites honestly.

## Commit & Pull Request Guidelines

The initial commit uses an imperative summary: `Document HackGT 13 wearable posture MVP`. Follow that concise style; no formal commit convention is established.

PRs should explain the change, its purpose, validation performed, and remaining decisions. Link related issues when available; include screenshots for future interface changes. Never commit credentials or real personal tracking data.
