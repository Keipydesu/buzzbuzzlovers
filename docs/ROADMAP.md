# Roadmap

Status: draft, under active discussion. This sequences the proposals in [MVP.md](MVP.md) into phases; it does not itself finalize any open decision listed there. Update this file as decisions are confirmed.

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
- [ ] Rails tooling, database, hosting, and single-profile versus account-based access
- [ ] Vet selected gems and other dependencies under [the dependency safety policy](dependency-safety.md), including exact versions, provenance, independent scrutiny, advisories, and transitive dependencies before installation

Review [the BLE telemetry proposal](ble-protocol.md) before agreeing on the contract. UUIDs and encoding there are proposed, not frozen. The telemetry layout can be reviewed independently of sensor thresholds; the hardware must be selected before wiring or validating detection.

## Phase 1 — Sensing and firmware

*Documentation review: codex. Implementation and physical hardware testing: team owner TBD.*

- [ ] Select and wire posture sensor to ESP32
- [ ] Verify the exact board supports BLE; document sensor interface, voltage compatibility, mounting stability, and power plan
- [ ] Implement calibration routine (upright baseline capture)
- [ ] Decide sample rate, filtering, sensor-error handling, threshold hysteresis, and whether episode duration includes the initial persistence window
- [ ] Implement posture classification loop distinguishing sustained slouch from brief movement
- [ ] Implement episode timing (start/end, elapsed slouch duration, count)
- [ ] Define session boundaries: what happens on BLE disconnect or device restart
- [ ] Expose results through BLE service per the agreed contract
- [ ] Validate with repeated upright, sustained lean, ordinary movement, and sensor-disconnection trials; record the actual setup and observed limitations

## Phase 2 — BLE and integration

*Documentation review: codex. Implementation: proposed codex support, team owner TBD.*

- [ ] Finalize BLE data contract (protocol version, device ID, session ID, sequence number, elapsed tracked time, posture state, cumulative slouch duration, cumulative episode count)
- [ ] Review proposed 20-byte little-endian snapshots and identity characteristic in [ble-protocol.md](ble-protocol.md); agree on state meanings and counter limits
- [ ] Browser-side BLE connect/disconnect flow with explicit stale/disconnected states
- [ ] Verify notifications and reads on the actual laptop; serialize reads and discard late callbacks from an old connection
- [ ] Duplicate/out-of-order update handling (sequence number reconciliation, not additive re-application of cumulative totals)
- [ ] Reconnect and resync behavior if disconnected logging is in scope
- [ ] Agree on byte-level fixtures shared by firmware and browser tests before coding either side

## Phase 3 — Rails and data

*Documentation review: claude. Implementation: team owner TBD.*

- [ ] Scaffold Rails app (framework choices: Hotwire/Stimulus, PostgreSQL, Tailwind — confirm before scaffolding)
- [ ] Session persistence model keyed on `(device_id, session_id)`, storing the latest accepted `sequence` and the snapshot fields from [ble-protocol.md](ble-protocol.md), plus receipt metadata and the clock anchor/timezone selected by the calendar policy; do not equate server receipt time with the actual session start
- [ ] Ingestion endpoint from browser-side BLE client: atomically accept an update only if `sequence` exceeds the stored value for that session and the snapshot invariants hold (`slouch_seconds <= tracked_seconds`, nondecreasing counters); ignore stale/identical updates, report conflicting equal-sequence payloads or invalid snapshots, and never add complete cumulative snapshots together
- [ ] Reject activity for session `0` and for any session already marked ended
- [ ] Decide and document the calendar policy from ble-protocol.md's "Reconnection and calendar limits": either the labeled browser-observed-start-date simplification, or genuine per-day buckets (needs additional protocol work first). Do not present the simplified version as measured daily activity in the UI copy
- [ ] Daily and weekly aggregation, computed only from recorded tracking time and the agreed calendar policy
- [ ] Daily challenge / reward rule (mechanics TBD, see MVP.md open decision 7)

## Phase 4 — Interface and demo

*Owner: TBD (proposed: claude)*

- [ ] Mobile-first dashboard: connection status, live posture/session state
- [ ] Today's totals view (tracked duration, slouch duration, episode count)
- [ ] Weekly history view
- [ ] Daily challenge progress/reward display
- [ ] Empty states before any activity is recorded; any sample data clearly labeled and separated from real history
- [ ] End-to-end demo rehearsal against the acceptance criteria in MVP.md

## Phase 5 — Demo acceptance pass

Re-verify each item in MVP.md's "Demo acceptance criteria" section against the working system before presenting.

## Out of scope for this roadmap

Everything listed under MVP.md's "Outside the first proposed scope" (native apps, ML classification, leaderboards, medical claims, vibration/cloud streaming) stays out until the core loop above is demoed.
