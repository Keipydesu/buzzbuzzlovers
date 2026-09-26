# 014 — Weekly competition implementation defaults

Date: 2026-09-26.

Status: implementation defaults under the authorized MVP work; not a claim of explicit product confirmation of the week start day.

## Context

Decision 013 accepted weekly scoring and left exact boundaries open. The operator then assigned Codex to implement and Claude to review. To deliver the simple working MVP, the implementation uses the defaults proposed in the plan and communicated to the operator.

## Decision

Use Monday–Sunday weeks in the existing fixed `DEMO_TIMEZONE` (default America/New_York). Calculate rankings when the page is requested. There is no finalized archive or upload cutoff: late accepted data can change either week's totals. Group membership includes the member's entire week's recorded data, including activity before joining. Leaving removes that member from subsequent group views.

Allocate a whole session by `first_observed_at` converted to the fixed app timezone. Do not use potentially differing per-session calendar zones to define a group week, and do not rewrite personal calendar buckets. This fills the open implementation detail in [decision 013](013-mvp-scoring-and-invites.md); it does not change the accepted ranking rule.

## Consequences

Cross-week sessions are not split into measured activity intervals. Incomplete sessions contribute saved totals. Current partial-week improvement is compared with the prior week's recorded share, clearly described in the UI. No-data members are unranked. Most-improved requires a strict positive percentage-point decrease, and all tied improvements are shown.

The saved-data dashboard replaces synthetic activity with real totals and a seven-day table. Half-hour frequency charts remain deferred until firmware supplies timed activity; this is a data limitation, not a new classification rule. Browser BLE integration and hosted Tiger Data rollout remain separate work.

## Related documents

- [MVP implementation](../social-competition-implementation-plan.md)
- [Account setup](../authentication-mvp.md)
- [Scoring and invitations](013-mvp-scoring-and-invites.md)
