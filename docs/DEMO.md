# Buzz Buzz comprehensive demo

**Historical standalone demo:** the repository root now contains the newer authenticated pose. app, Muse integration, and ESP32/BLE source. See [local demo setup](local-demo.md) for that app. This guide describes only the isolated simulator in `demo/`, including its original reward and protocol assumptions.

A runnable, local Rails demo for presenting the posture-awareness concept without wearable hardware. Everything on the demo screen is **synthetic**. It includes a guided story, manual presenter controls, saved sessions, a sample week, a daily reward, failure scenarios, and JSON export.

## Start here

Requirements: Ruby 3.2 or newer (developed with 3.3.12), Bundler, and a browser. Node.js 18+ is needed only to run JavaScript tests. There is no frontend build, CDN, API key, account, or hardware dependency. Internet access is needed for the first gem installation; afterward the demo can run locally without it.

```sh
cd demo
bin/setup
bin/demo
```

Open **http://127.0.0.1:3100**. Click **Run guided demo** under Presenter controls. The automatic sequence takes approximately 42 seconds, with simulated time advancing at 60×. Leave the tab in the foreground; browser background throttling affects timing.

`bin/setup` installs the locked gems and prepares SQLite. `bin/demo` prepares the database and starts Rails on loopback. Stop it with Ctrl-C. Run `PORT=3101 bin/demo` if port 3100 is in use. `DEMO_TIMEZONE=America/Los_Angeles bin/demo` changes the configured calendar timezone; existing sessions retain their original date bucket.

On this Mac, if the shell selects Apple's Ruby 2.6, run:

```sh
export PATH="$HOME/.rbenv/versions/3.3.12/bin:$PATH"
```

This is an isolated demo under `demo/`. The production app API in `app-api.md` remains a proposal. The demo uses `/api/demo` and does not claim to implement the full device-registration or real BLE API.

## What is included

| Feature | Demo behavior |
| --- | --- |
| Connect / disconnect | Connects a virtual wearable; connection state stays separate from session state |
| Calibration | A device-simulator state; no tracked time accrues during calibration |
| Posture states | Simulated upright, sustained slouch, sensor error, and ended states |
| BLE payload | Simulator encodes and browser decodes the proposed exact 20-byte layout |
| Episode timing | Simulator emits cumulative classified seconds and episode counts |
| Live display | Tracked time, slouch duration, episode count, stale and last-known labels |
| Persistence | Rails and SQLite store accepted revisions across page refresh and server restart |
| Ordering | Duplicate/stale revisions do not increase totals; conflicts and counter regressions are rejected |
| Saving queue | One in-flight upload; newer revisions stay pending; terminal snapshots survive new sessions within the tab |
| Daily totals | Weighted non-slouch percentage and cumulative totals across saved sessions |
| Weekly history | Seven dates, stacked duration chart, exact table, explicit no-data days |
| Sample history | Button adds five synthetic completed sessions, without duplicating them on repeated clicks |
| Challenge | 20 saved tracked minutes earn 50 points once per first-seen date |
| Journal | Most recent 30 sessions, with incomplete sessions explicitly labeled |
| Export | JSON of the currently returned dashboard data, including up to 30 recent sessions |
| Reset | Confirmation before clearing this demo's synthetic records and pending queue |
| Presentation | Automatic tour, manual controls, and a three-minute script below |

## Three-minute presenter script

### 0:00–0:25 — The problem

“Long study sessions make it easy to stop noticing how we sit. Buzz Buzz is a wearable posture-awareness concept: the device calculates the results, and the dashboard helps you see patterns. Today's demo uses a clearly labeled virtual wearable.”

Point to the simulation banner. Explain that neither the browser nor Rails performs raw-sensor posture classification.

### 0:25–1:15 — The live loop

Click **Run guided demo**. Narrate the automatic sequence:

1. Calibration: tracked time stays at zero.
2. Upright: calculated non-slouch time increases.
3. Sustained slouch: one episode appears and its duration grows.
4. Recovery: slouch time stops growing while total tracked time continues.
5. Saving outage: the device stays live, but the app shows unsaved data.
6. Disconnect and reconnect: the view becomes last-known; reconnect recovers cumulative totals for the retained virtual session.
7. End: the terminal snapshot is saved and the reward is earned.

“Presentation speed is 60×. These are synthetic minutes, not elapsed wall-clock minutes.”

### 1:15–1:50 — Show reliability

Wait for **All received readings saved**. Click **Replay last packet**. Show the duplicate acknowledgment and unchanged totals. Refresh the page: history and reward remain, while the live connection becomes disconnected and the posture label becomes last-known.

“Receiving a packet twice doesn't mean the person sat twice. We save cumulative session revisions, not a new total for every packet.”

### 1:50–2:25 — Show the product

Point to today's tracked time, slouch duration, and episodes. Explain the percentage as **device-classified non-slouch time within recorded tracking time**. Point to the sample week and its no-data day. Expand the exact weekly totals. Show the 20-minute challenge and journal, then optionally export JSON.

“These summaries group sessions by first-seen date. We don't claim to reconstruct activity during unobserved hours or accurately split a session across midnight.”

### 2:25–3:00 — Architecture and next step

“The physical ESP32 will own calibration, classification, and episode timing. BLE will carry the already calculated results. Our Rails demo already exercises storage, deduplication, history, and rewards. The next integration step is choosing the sensor and testing actual device firmware and BLE on the demo laptop.”

Close on awareness and small habits. Do not claim validated health outcomes or implemented vibration feedback.

## Manual rehearsal checklist

- Start from an empty history or disclose existing sample data.
- Connect simulator → Start / calibrate. Verify no classified seconds accumulate.
- Choose Sit upright; then Sustained slouch; then Sit upright. One sustained episode should remain one episode.
- Choose Sensor error. Both durations should stop increasing.
- Resume Sit upright. Enable Pause BLE heartbeats. After three seconds, the connection label should become stale; disable it to recover the retained cumulative reading.
- Enable Simulate saving outage. Live values should continue and the unsaved indicator should appear. Disable it and wait for saving to complete.
- Disconnect. The simulator continues internally; reconnect recovers the latest cumulative values. Disconnection must not label the session completed.
- End session and wait for the saved indicator. Replay its last packet: duplicate, no extra totals or points.
- Refresh. Saved history remains; live state is disconnected / last-known. A refresh destroys the virtual wearable instance; an unfinished session stays incomplete.
- Load the sample week twice. Totals must remain unchanged on the second click.
- Check a narrow browser window: content should reflow; tables scroll horizontally.

## Technical choices and limits

- Rails 8.1, SQLite, ERB, plain CSS and browser modules keep setup small. PostgreSQL, Hotwire, and Tailwind remain production proposals, not new confirmed project requirements.
- A single synthetic profile and namespace keep demo data separate from future real-device history. SQLite has database constraints and transactional reconciliation; no user accounts or public deployment are provided.
- The virtual wearable's controls represent physical device controls. They are not BLE write commands. No real Bluetooth connection is attempted.
- The provisional reward and first-seen calendar policy are demo defaults, not changes to hardware/product decisions in the planning documents.
- The in-memory queue is lost on page closure. A best-effort unload warning appears when data is pending. Completed server saves persist in `demo/storage/demo.sqlite3`; these files are git-ignored.
- Reload stops the virtual device. There is no physical firmware, sensor calibration algorithm, disconnected historical buffer, or raw-angle processing in this implementation.
- Run one presenter tab at a time. Tabs do not share a simulated wearable; concurrent tabs can choose the same session identifier and produce a visible conflict. Public use needs authentication, ownership, deployment secrets, and a production data model.
- The application is intended to bind to `127.0.0.1`. The development secret is local-only. Do not expose this no-login demo on a public or LAN interface.

## Validation

```sh
cd demo
bin/rails test
node --test test/*.mjs
```

Rails tests cover ingestion ordering, terminal sessions, validation/ranges, weighted totals, reward idempotency, frozen timezone buckets, seed idempotency, reset, body limits, malformed JSON, and CSRF. JavaScript tests cover the documented BLE fixture, uint32 values, invalid packets, ordering, the complete guided sequence, and a newer reading arriving while an older one uploads. The workflow tests use a minimal DOM and controlled network; they are not visual browser or hardware tests.

Browser visual QA and real hardware verification remain manual: no browser automation surface was available in the build environment.

## Troubleshooting

- **Wrong Ruby version:** check `ruby -v`; select Ruby 3.3.12 using rbenv or your Ruby manager, then rerun `bin/setup`.
- **Missing gems:** run `bundle install` in `demo/` with internet access. On a platform without a SQLite binary gem, install your platform's compiler/build tools and SQLite development package.
- **Port already used:** use `PORT=3101 bin/demo` and open the matching URL.
- **Unsaved readings:** disable Simulate saving outage, make sure Rails is running, and leave the tab open for retries. Do not reload until saving completes.
- **Stale readings:** disable Pause BLE heartbeats and keep the tab foregrounded. Reconnect if disconnected.
- **Guided demo won't start:** end the active session first; a second tour never silently overwrites it.
- **Unexpected old history:** use Clear simulated history after exporting anything you want to keep.

Rails setup reference: [official Getting Started guide](https://guides.rubyonrails.org/getting_started.html).
