# Repository Guidelines

## Project Structure & Module Organization

This repository is currently documentation-only. `README.md` introduces the project; `docs/MVP.md` records scope, architecture, acceptance criteria, and open decisions. Keep additional planning documents in `docs/` and link important additions from the README. No application source, firmware, tests, or asset directories exist yet.

## Architecture & Scope

The ESP32 performs calibration, posture classification, and episode timing locally. BLE transfers calculated results to a laptop browser; the proposed Rails app stores sessions and displays daily totals, weekly history, and rewards. Do not move posture classification into the browser or backend.

Rails is the preferred framework. Database, frontend tooling, hardware, and deployment choices remain open. Keep proposals distinct from confirmed decisions. Do not scaffold applications or restore the discarded JavaScript prototype without a request to begin implementation.

## Dependency Safety

Use only established dependencies whose provenance, maintenance history, and security have been reviewed. This applies to Ruby gems, their transitive dependencies, and any JavaScript/npm packages or other third-party libraries introduced later. Do not choose brand-new packages or newly released versions without substantial independent scrutiny merely because they are latest or convenient. A familiar name, download count, or clean vulnerability scan alone does not establish safety.

Follow [the dependency safety policy](docs/dependency-safety.md) before installing, adding, or updating dependencies. Prefer supported, vetted versions; record review evidence in dependency PRs, commit lockfiles, and inspect transitive changes. If safety cannot be established, do not install or adopt the dependency. Security fixes require prompt review rather than a blanket waiting period.

## Build, Test, and Development Commands

There are no build, install, development-server, or automated-test commands yet. For documentation changes, run:

- `git status --short` — inspect changed and untracked files.
- `git diff --check` — detect whitespace errors in tracked changes.
- `git diff --cached --check` — check newly added files after staging.

Verify relative Markdown links manually. Document actual setup and execution commands when implementation begins.

## Coding Style & Naming Conventions

Use descriptive Markdown headings, short paragraphs, and fenced code blocks for commands or payload examples. Use relative links, such as `docs/MVP.md`. Prefer descriptive filenames such as `docs/ble-protocol.md`. Keep indentation consistent within lists and examples.

No formatter, linter, or language-specific style configuration is installed. Establish code conventions with the selected toolchain rather than assuming existing enforcement.

## Testing Guidelines

No test framework or coverage target has been selected. Treat the acceptance criteria in `docs/MVP.md` as the starting validation checklist. Future tests should cover duplicate transfers, reconnects, stale readings, session persistence, and time aggregation. Define test naming and execution commands when introducing the framework.

## Commit & Pull Request Guidelines

The initial commit uses an imperative summary: `Document HackGT 13 wearable posture MVP`. Follow that concise style; no formal commit convention is established.

PRs should explain the change, its purpose, validation performed, and remaining decisions. Link related issues when available; include screenshots for future interface changes. Never commit credentials or real personal tracking data.
