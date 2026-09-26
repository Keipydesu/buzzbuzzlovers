# BLE telemetry proposal

**Status: draft for review, not an approved or implemented contract.** This specifies calculated results only. Firmware owns posture classification; the browser decodes values and forwards them to Rails. See [MVP.md](MVP.md) and [ROADMAP.md](ROADMAP.md) for scope decisions.

## Proposed service

Use these project-specific 128-bit UUIDs consistently if this proposal is accepted:

| Item | UUID | Properties |
| --- | --- | --- |
| Posture service | `caa153e1-8bec-412c-a7ea-570bf12cbd13` | Advertised service |
| Device identity | `5a02ab16-022f-43a7-8b81-2d136526c605` | Read |
| Session snapshot | `3ea72a7d-ef99-4f43-95d7-d6860687824e` | Read, Notify |

Identity is 16 opaque bytes generated once and persisted on the device. Convert bytes in wire order to 32 lowercase hexadecimal characters for the Rails key. Do not use the Bluetooth display name as identity. Identity is an identifier, not an authentication credential.

The browser filters discovery by service UUID, reads identity, subscribes to notifications, and reads the current snapshot. Bind callbacks to that connection's identity; discard callbacks after the connection is replaced. Reads and notifications share the same ordering rules.

Chrome supports reading characteristics and receiving GATT notifications through Web Bluetooth. Pairing must follow a user gesture and use a secure context. Verify support on the team's actual laptops before committing to this path. [Chrome documentation](https://developer.chrome.com/docs/capabilities/bluetooth)

## Snapshot encoding

Exactly **20 bytes**, with unsigned multi-byte integers encoded little-endian. Reject other lengths or unsupported versions. This compact layout avoids relying on large messages or application-level fragmentation; verify transport behavior on the selected firmware stack.

| Byte offset | Type | Field | Meaning |
| --- | --- | --- | --- |
| 0 | uint8 | version | `1` |
| 1 | uint8 | state | Enum below |
| 2 | uint32 | session_id | Persisted, increasing session counter; `0` reserved for no session |
| 6 | uint32 | sequence | Increasing snapshot revision within this session |
| 10 | uint32 | tracked_seconds | Cumulative valid, classified tracking time |
| 14 | uint32 | slouch_seconds | Cumulative detected slouch time |
| 18 | uint16 | episode_count | Cumulative number of detected episodes |

Proposed states: `0` idle, `1` calibrating, `2` upright, `3` slouching, `4` sensor error, `5` ended. Unknown values are rejected. Before the first session, identity remains readable and the snapshot uses session `0`, state idle, and zero counters. Session `0` is never ingested as activity.

Track time internally at firmware precision; transmit cumulative whole seconds rounded down. No tracking time accumulates during calibration or sensor failure. Require `slouch_seconds <= tracked_seconds`; all counters must be nondecreasing within a session. An episode qualifies only after a continuously detected slouch lasts **more than 60 seconds**, and is counted once per sustained episode; see [decision 006](decisions/006-one-minute-slouch-qualification.md). This is an accepted requirement, not implemented firmware. The detection proposal must still define treatment of the initial persistence window and interruptions during an episode.

## Publication and lifecycle

- Propose one snapshot per second while connected, plus state-change updates. This is a transfer rate, not the sensor sampling rate.
- Increment sequence for each newly published snapshot, including periodic heartbeats. Reading the same cached snapshot does not increment it. Publish fields atomically so one packet represents one consistent revision.
- Allocate and persist a new nonzero session ID before starting a session; never reuse it under the same device identity. Start sequence at `1` for each session.
- A reboot must not resume a session with reset counters. Allocate a new session when tracking restarts. Regenerate device identity if its session-counter storage is erased.
- Do not wrap or saturate counters silently. End tracking before a counter would overflow; session-ID exhaustion requires a new identity. The completed session is immutable.
- Calibration, start, and end triggers are unresolved: physical controls versus a separately specified write characteristic. This proposal does not define browser command behavior.

## Browser and Rails reconciliation

Key sessions by `(device_id, session_id)`. Atomically accept an update only if `sequence` exceeds the stored revision and counters satisfy the invariants. Replace cumulative totals; never add complete snapshots together. Ignore older or identical revisions, and report equal revisions with different contents as a protocol error. Once ended, reject further activity for that session.

The browser uses the same checks for live display. After three seconds without a fresh heartbeat, propose a stale indicator; a disconnection is immediate. Neither stale nor disconnected means upright, ended, or zero activity. Rails receipt time is transport metadata, not proof of when posture activity occurred.

## Reconnection and calendar limits

Reading the latest cumulative snapshot can recover totals for the **same still-retained session** after missing notifications. It cannot recover an overwritten session, reconstruct individual episodes, or assign unseen activity to calendar days. A lost final snapshot must leave a session incomplete unless it can be retrieved later.

Before claiming disconnected or all-day history, agree on retention capacity, final-record acknowledgment, restart recovery, timestamp synchronization, and per-day records. These require additional protocol work beyond this telemetry draft.

For a connected demo, one proposed simplification is to group each session under its browser-observed start date and label the chart accordingly. This is not accurate calendar-day accounting for midnight-spanning sessions or sessions first observed late. Decide between that explicitly limited demo and genuine per-day buckets before implementing weekly aggregation. Never silently label receipt-day totals as measured daily activity.

## Review fixtures and remaining gates

Agree on fixtures for these cases before implementation:

- Version `1`, upright, session `7`, sequence `12`, tracked `60`, slouch `10`, episodes `2` decodes from `01 02 07 00 00 00 0c 00 00 00 3c 00 00 00 0a 00 00 00 02 00`.
- Duplicate, out-of-order, and conflicting equal-sequence packets do not inflate totals.
- Unsupported versions, invalid states, truncated packets, decreasing counters, and slouch time exceeding tracked time are rejected.
- Same-session reconnect preserves totals; a new session does not inherit the old counters.
- Sensor errors, stale data, reboot, lost final packets, and midnight crossing produce explicit, testable behavior.

Confirm the laptop/browser, firmware stack, command controls, storage/sync scope, calendar policy, and access model before treating this document as the v1 contract. No hardware testing or browser integration has been performed yet.
