# Roadmap

Status: draft, under active discussion. This sequences the proposals in [MVP.md](MVP.md) into phases; it does not itself finalize any open decision listed there. Update this file as decisions are confirmed.

## Current status and priorities

PR #1 is merged. Username/password authentication and account-scoped API access are implemented locally and independently reviewed. Saved friend groups, link/code joining, and weekly rankings are implemented locally and independently reviewed; see [the competition implementation](social-competition-implementation-plan.md). Browser BLE transport and the upload queue are implemented; physical verification remains pending. The merged Tiger snapshot-history and hypertable bootstrap implementation is preserved. The immediate MVP target is a local demo; production setup is deferred.

Current order: follow the [hardware integration plan](hardware-integration-plan.md), verify the actual firmware/browser setup, validate the implemented browser transport, authenticated upload queue, and live dashboard on the physical device, then rehearse the local demo. Competition and canonical/history writes already exist; public hosting remains deferred. The phase sections below group workstreams rather than implying that every earlier item has landed.

Public-release blockers: authentication and verified device ownership, tenant-scoped reads/writes, secure hosting/database connections, ingestion correctness, dependency review, and agreed retention/recovery/budget. Durable browser outbox, accurate cross-midnight history, device transfers, continuous aggregates, and columnstore optimization remain deferred unless separately approved. Follow [data-storage.md](data-storage.md) for acceptance checks.

The `Hardware/slouch_detector/slouch_detector.ino` source implements the documented UUIDs and binary fields. [Decision 016](decisions/016-integrate-existing-hardware.md) directs software to adapt to its current behavior. The detailed historical checklists below are not completion evidence: source exists for sensing/BLE, but physical verification is pending; browser connection controls, byte decoding, and upload synchronization are now implemented and covered by synthetic tests.

## Guiding order

BLE contract first, then firmware and app work in parallel against that contract, then integration, then demo polish. Pairing on the BLE contract early avoids rework in both directions.

## Phase 0 — Decisions to close before scaffolding

Close the relevant gates before implementing each workstream. Documentation and contract review can proceed now. See MVP.md "Open decisions" for the full list:

- [ ] ESP32 variant, posture sensor, and mounting location
- [ ] BLE data contract v1: field list, units, encoding, service/characteristic UUIDs
- [ ] Laptop OS/browser combination for the demo (Web Bluetooth support)
- [ ] Scope of first demo: connected-session only, or disconnected logging + resync
- [ ] Calibration/start/end controls: physical device controls or browser commands
- [ ] Session clock anchor, timezone, and treatment of sessions spanning midnight; cumulative totals alone do not encode calendar history
- [ ] Vetted Rails/PostgreSQL/TimescaleDB versions, Rails host, Tiger Cloud region/tier and budget, account authentication, and verified device enrollment
- [ ] Vet selected gems and other dependencies under [the dependency safety policy](dependency-safety.md), including exact versions, provenance, independent scrutiny, advisories, and transitive dependencies before installation

Review [the BLE telemetry proposal](ble-protocol.md) before agreeing on the contract. UUIDs and encoding there are proposed, not frozen. The telemetry layout can be reviewed independently of sensor thresholds; the hardware must be selected before wiring or validating detection.

## Phase 1 — Sensing and firmware

*Documentation review: codex. Implementation and physical hardware testing: team owner TBD.*

- [ ] Select and wire posture sensor to ESP32
- [ ] Verify the exact board supports BLE; document sensor interface, voltage compatibility, mounting stability, and power plan
- [ ] Implement calibration routine (upright baseline capture)
- [ ] Decide sample rate, filtering, sensor-error handling, threshold hysteresis, and whether episode duration includes the initial persistence window
- [ ] Implement posture classification with more than 60 seconds of continuous slouch required per episode; see [decision 006](decisions/006-one-minute-slouch-qualification.md)
- [ ] Implement episode timing (start/end, elapsed slouch duration, count)
- [ ] Define session boundaries: what happens on BLE disconnect or device restart
- [ ] Expose results through BLE service per the agreed contract
- [ ] Validate with repeated upright, sustained lean, ordinary movement, and sensor-disconnection trials; record the actual setup and observed limitations

## Phase 2 — BLE and integration

*Documentation review: codex. Implementation: proposed codex support, team owner TBD.*

- [ ] Finalize BLE data contract (protocol version, device ID, session ID, sequence number, elapsed tracked time, posture state, cumulative slouch duration, cumulative episode count)
- [ ] Review proposed 20-byte little-endian snapshots and identity characteristic in [ble-protocol.md](ble-protocol.md); agree on state meanings and counter limits
- [x] Browser-side BLE connect/disconnect flow with explicit stale/disconnected states (automated; physical check pending)
- [ ] Verify notifications and reads on the actual laptop; serialize reads and discard late callbacks from an old connection
- [x] Duplicate/out-of-order update handling (sequence reconciliation; Node and browser fixture tests)
- [ ] Reconnect and resync behavior if disconnected logging is in scope
- [ ] Agree on byte-level fixtures shared by firmware and browser tests before coding either side

## Phase 3 — Rails and hosted data

*Documentation review: claude. Implementation: team owner TBD.*

- [ ] Resolve review findings in the Rails scaffold; confirm supporting tooling and versions
- [ ] Follow [the Tiger Data integration plan](data-storage.md): isolated development service, verified TLS, ordinary account/session tables, and accepted-snapshot hypertable
- [ ] Implement account authorization and device enrollment before public hosting; scope all reads and writes to the current user
- [ ] Verify atomic session/history writes, concurrency and retry idempotency, backup/restore, deletion, retention, and capacity budget before hosted pilot
- [ ] Session persistence model keyed on `(device_id, session_id)`, storing the latest accepted `sequence` and the snapshot fields from [ble-protocol.md](ble-protocol.md), plus receipt metadata and the clock anchor/timezone selected by the calendar policy; do not equate server receipt time with the actual session start
- [ ] Ingestion endpoint from browser-side BLE client: atomically accept an update only if `sequence` exceeds the stored value for that session and the snapshot invariants hold (`slouch_seconds <= tracked_seconds`, nondecreasing counters); ignore stale/identical updates, report conflicting equal-sequence payloads or invalid snapshots, and never add complete cumulative snapshots together
- [ ] Reject activity for session `0` and for any session already marked ended
- [ ] Decide and document the calendar policy from ble-protocol.md's "Reconnection and calendar limits": either the labeled browser-observed-start-date simplification, or genuine per-day buckets (needs additional protocol work first). Do not present the simplified version as measured daily activity in the UI copy
- [ ] Daily and weekly aggregation, computed only from recorded tracking time and the agreed calendar policy
- [ ] Daily challenge / reward rule (mechanics TBD, see MVP.md open decision 7)

## Phase 4 — Interface and demo

*Owner: TBD (proposed: claude)*

The public `/` introduces bbl before account creation or login; signed-in visitors see saved personal/group totals. Landing, login, and signup follow the [mobile-first UI requirements](mobile-first-interface.md) with light/dark themes. The original sample charts, goal ring, and milestones are historical previews, not current saved-data features. Browser BLE is implemented with fixture-based coverage; physical verification and the remaining unchecked acceptance items are unfinished.

- [x] Mobile-first dashboard: connection status, live posture/session state (synthetic browser coverage; physical check pending)
- [ ] Trend-first dashboard with today’s frequency bar chart; agree device time buckets/events and coverage before connecting real timeline data
- [ ] Today's totals view (tracked duration, slouch duration, episode count)
- [ ] Weekly history view
- [ ] Daily challenge progress/reward display
- [ ] Empty states before any activity is recorded; any sample data clearly labeled and separated from real history
- [ ] End-to-end demo rehearsal against the acceptance criteria in MVP.md

## Phase 5 — Demo acceptance pass

Re-verify each item in MVP.md's "Demo acceptance criteria" section against the working system before presenting.

## Out of scope for this roadmap

Friend-group leaderboards are now in scope under decisions 011–014. Native apps, ML classification, medical claims, vibration/cloud streaming, advanced rewards and anti-cheat remain outside this MVP.
