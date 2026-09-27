# MVP plan


Current follow-up: [decision 017](decisions/017-ten-second-slouch-grace.md) replaces the one-minute rule with ten-second qualification/full-candidate credit and three-second reset. [Decision 018](decisions/018-mvp-first-connection-registration.md) replaces mandatory manual provisioning with trusted first-use registration for MVP. Existing ownership remains protected; stronger enrollment is still required for an untrusted public rollout. Historical proposals below yield to these decisions.

Current integration reference (2026-09-26): [hardware integration plan](hardware-integration-plan.md), [BLE source contract](ble-protocol.md), and [current API](app-api.md). Firmware now exists under `Hardware/`; accounts, ownership, canonical sessions, and atomic accepted history are implemented in Rails. The immediate target is the local demo; the browser adapter is implemented with automated fixture coverage; physical device validation remains pending. Historical proposals below are superseded where they describe absent hardware/accounts/history or public hosting as the immediate milestone.

## Product goal

Help people who spend long hours at their desks understand how often and how long they slouch, review a week of tracking, and build awareness through simple gamification.

The wearable is responsible for sensing and calculating posture. The app is primarily a dashboard for the results.

## Agreed direction

| Area | Decision |
| --- | --- |
| Team | Four people; team name buzzbuzzlovers |
| Wearable | ESP32; exact model and sensor undecided |
| Computation | All posture calculations run locally on the ESP32 |
| Transfer | Bluetooth Low Energy from wearable to laptop browser |
| Web framework | Ruby on Rails preferred |
| Storage direction | Online user history using Tiger Data hypertables; managed-cloud integration proposed |
| Interface | Mobile-first web app |
| Initial demo | Laptops; no Android phone available |
| Core measurements | Slouch episode count and total slouch duration during tracked time |
| History | Weekly view |
| Motivation | Gamified posture-awareness progress |

No build deadline has been set. Tiger Data integration is the chosen storage direction; service tier/region, Rails host, authentication design, supporting tools, sensor, and sensor-angle threshold remain open. Slouch qualification now requires at least 10 continuous seconds, credits the full candidate, and resets after 3 seconds upright; see [decision 017](decisions/017-ten-second-slouch-grace.md). See [the hosted storage plan](data-storage.md).

## Proposed first complete loop

1. Put on the wearable and establish a comfortable upright baseline.
2. Open the dashboard on a compatible laptop browser and connect over BLE.
3. Start a tracking session.
4. The ESP32 detects sustained slouching and updates episode counts and duration.
5. The browser displays calculated posture state and session totals received from the ESP32.
6. Save the results through Rails and inspect today's totals and the weekly view.
7. Show progress toward one simple daily challenge.

Calibration, session controls, and the exact challenge mechanics are proposals to agree on before implementation.

## Proposed MVP scope

### Wearable

- Read the selected posture sensor.
- Calibrate against a user-specific upright baseline.
- Calculate posture state, sustained slouch episodes, and elapsed slouch time locally.
- Distinguish sustained posture changes from brief ordinary movement.
- Expose computed results through a BLE service.
- Define session boundaries and what happens when Bluetooth disconnects or the device restarts.

The persistence requirement is at least 10 continuous seconds, counting a sustained episode once and crediting that full candidate. Three continuous upright seconds reset detection. Sensor-angle thresholds, filtering, sensor placement, and recovery behavior must be tested on the selected hardware. Values from the discarded prototype are not established requirements.

### Web app

- A connect/disconnect flow with clear connection status.
- Lead with today’s slouch-frequency bar chart to support habit change; time-bucketed device history is required for real data and is not implemented. See [decision 007](decisions/007-lead-with-habit-trends.md).
- Keep connection/session status secondary; mark disconnected or stale readings explicitly.
- Today's tracked duration, slouch duration, and episode count.
- Weekly history drawn from centrally saved sessions.
- Authenticated accounts and verified device ownership before online user data is exposed; no user-managed local database.
- One simple daily challenge and visible progress or reward. A tracking-duration goal is a starting proposal; scoring remains open.
- Layout usable on phones and laptops, while clearly communicating Bluetooth compatibility.
- Useful empty states before any activity is recorded. Any example data must be labeled and kept separate from real history.

All percentages and summaries must refer to recorded tracking time, not assume that unobserved time was upright. Sensor classification remains on the ESP32; Rails can aggregate the already calculated results into daily and weekly summaries.

## Proposed BLE data contract

Agree on a small, versioned contract before splitting firmware and app work. Prefer calculated state and cumulative totals over continuous raw sensor uploads.

Candidate fields:

| Field | Purpose |
| --- | --- |
| Protocol version | Identify the payload format |
| Device ID | Identify the wearable |
| Session ID | Distinguish tracking sessions, including across restarts |
| Sequence number | Detect duplicate or out-of-order updates |
| Elapsed tracked time | Denominator for session summaries |
| Current posture state | Drive the live indicator; include unknown/uncalibrated states |
| Cumulative slouch duration | Display and persist time spent in detected episodes |
| Cumulative episode count | Display and persist slouch frequency |

Units, encoding, BLE service/characteristic UUIDs, transfer frequency, and timestamp handling remain undecided. Repeated cumulative totals must replace or reconcile earlier totals rather than being added repeatedly.

For an eventual all-day experience, the device should retain unsynced results and transfer them after reconnecting. That is a proposed requirement, not a capability already implemented. Decide memory limits, reset behavior, and how time is assigned to calendar days; a single cumulative total cannot reconstruct activity across multiple days without time-bucketed records.

## Proposed software stack

- **Ruby on Rails:** preferred and agreed direction for the web app.
- **Hotwire / Stimulus:** candidate for dashboard interactions and browser-side BLE handling.
- **Tiger Data / PostgreSQL:** chosen online-storage direction; propose managed Tiger Cloud with ordinary account/session tables and an accepted-snapshot hypertable, as detailed in [data-storage.md](data-storage.md).
- **Tailwind CSS:** candidate for interface styling.

Rails and Tiger Data online storage are stated directions. Supporting tools and deployment details remain proposals; the existing scaffold does not implement hosted authentication or hypertables. Bluetooth talks to browser JavaScript, which sends results to Rails; the Rails server does not directly connect to the wearable.

## Demo acceptance criteria

- The selected laptop can discover and connect to the ESP32.
- Calibration and classification execute on the device.
- A brief movement does not immediately create a slouch episode.
- Sustained leaning creates one episode, and returning to the calibrated range ends it.
- The app displays received results without recalculating posture from raw readings.
- Ending a session preserves its totals, visible after refreshing the dashboard.
- Repeated or retried transfers do not double-count activity.
- A lost connection is visible and is not shown as live upright posture.
- Daily and weekly summaries use recorded data, with any sample week explicitly labeled.
- The chosen daily challenge updates from recorded activity.
- Users can access only their own devices and history. Trusted MVP first-claim registration assigns unused IDs; it is not proof of possession. Existing-owned IDs cannot be claimed by guessing them.
- Accepted revisions update canonical sessions and append history atomically; retries create no extra history or rewards.
- Internet or cloud-database failure leaves BLE status truthful and marks pending data unsaved.

## Suggested four-person work split

| Workstream | Responsibility |
| --- | --- |
| Sensing and firmware | Sensor setup, calibration, classification, episode timing |
| BLE and integration | BLE contract, laptop connection, reconnect behavior, synchronization |
| Rails and data | Session persistence, ingestion, daily/weekly aggregation, reward rules |
| Interface and demo | Mobile-first dashboard, history visualization, end-to-end testing, presentation |

These are proposed workstreams, not assignments to named team members. Pair on the BLE contract early so the firmware and app agree on units and session semantics.

## Open decisions

1. Which ESP32 variant, posture sensor, mounting location, and power source?
2. Which laptop operating systems and browsers will be used for the demo?
3. Is the first demo connected-session tracking only, or must it include disconnected logging and later synchronization?
4. Which Rails host and Tiger Cloud region/tier fit the budget, and what offline queue behavior is required? Cloud persistence needs internet access.
5. Which vetted PostgreSQL/TimescaleDB versions, supporting Rails tools, and styling approach should be used?
6. How do calibration and start/end-session controls work across the device and app?
7. What daily challenge and reward should the first version use?
8. Which account-authentication and device-enrollment design will secure hosted user data? Separate ownership scopes are required online.
9. What snapshot/session retention, deletion, backup/recovery, and capacity budget should the hosted service use?

## Outside the first proposed scope

- Native mobile applications and iPhone Bluetooth support.
- Machine learning or app-side posture classification.
- Complex rewards or a large achievement system. Friend-group weekly leaderboards are now in scope under [decisions 011–014](social-competition-implementation-plan.md).
- Medical diagnosis or claims that the product treats or prevents health conditions.
- Vibration feedback, cloud raw-sensor streaming, and other hardware features not yet requested.

Revisit these only after the core device-to-dashboard loop works.
