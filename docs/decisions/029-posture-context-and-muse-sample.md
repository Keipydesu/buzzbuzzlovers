# 029 — Explain posture patterns and show a sample Muse conversation

Date: 2026-09-26.

Status: accepted user request, implemented presentation change. The static sample is superseded by [decision 030](030-continuing-muse-chat.md); the sourced posture explanation remains.

## Context

The user requested pulling the latest app, keeping its color scheme, explaining why slouching can be a concern, and adding a sample conversation with Muse at the bottom.

## Decision

Preserve pose.'s existing navy, gold, and white theme variables, including light mode. Place a short sourced explanation and a scripted Muse conversation after the dashboard's metrics and weekly history. Reuse the same content near the bottom of the public landing page. Keep the existing authenticated Ask Muse destination.

Explain sustained positions and discomfort without claiming that every slouch causes pain or damage. Sample messages must be visibly illustrative, not attributed to a live model call or the viewer's records. Do not send any data to Muse when rendering the example.

## Consequences

The competition-first order remains unchanged. No schema, scoring, account, BLE, model-provider, or dependency changes are needed. Direct review of User, PostureSession, schema and migration structure found this to be presentation-only. The older isolated simulator also receives the static explanation, retaining its own existing palette.

## Related documents

- [Visual direction](004-focused-health-tracker-interface.md)
- [Competition-first dashboard](020-competition-first-uncluttered-dashboard.md)
- [Posture research](../posture-health-research.md)
- [NHS posture and pain guidance](https://www.cuh.nhs.uk/patient-information/myth-busting-about-posture-core-stability-and-lifting/)
- [NHS seating guidance](https://www.cuh.nhs.uk/patient-information/seating-and-ergonomics/)
