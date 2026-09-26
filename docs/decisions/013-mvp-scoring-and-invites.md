# 013 — MVP scoring, most-improved stat, and invite mechanism

Date: 2026-09-26.

Status: accepted for MVP; week-boundary/finalization timing still proposed, not finalized.

## Context

Following [decision 011](011-social-competition-direction.md) and [decision 012](012-mvp-auth-and-competition-scope.md), the user confirmed the ranking rule, an additional non-ranking stat, the invite mechanism, and explicitly accepted trust-based MVP scope (no anti-cheat, no minimum-coverage eligibility rule).

## Decision

- **Ranking**: first place is the group member with the lowest weighted weekly slouch share (slouch_seconds / tracked_seconds for the week). Ties share a rank. A member with zero tracked time for the week is unranked, not ranked first by default of having no slouch.
- **Most improved (non-ranking)**: a separate stat showing which member's weekly slouch share improved the most versus their own prior week. Purely informational; does not affect the leaderboard ranking.
- **Eligibility / anti-cheat**: none for MVP. The user explicitly accepts that friends are trusted not to cheat (e.g. not wearing the tracker to post an artificially low share). No minimum tracked-hours/days threshold gates ranking eligibility. This can be revisited post-MVP.
- **Group invites**: a single invitation resolves to both a shareable link and a short code; using either joins the group immediately with no approval step and no username-based invite flow.
- **Week boundary**: proposed as a fixed calendar week (using the existing `calendar_timezone`/`calendar_day` fields already stored per session); exact day-of-week boundary and when a week is "finalized" for ranking purposes is still open and needs a concrete proposal before implementation.

## Consequences

Ranking and most-improved computations can both be derived read-time from existing `posture_sessions` aggregates grouped by week and device/account, without needing a separate "scores" table for MVP — a competition_periods/entries table is deferred unless read-time aggregation proves insufficient.

Trust-based scope means no server-side signal is required to detect a member who avoids wearing the tracker to top the leaderboard; this is a known, accepted MVP limitation.

## Related documents

- [Social competition direction](011-social-competition-direction.md)
- [MVP auth and competition scope](012-mvp-auth-and-competition-scope.md)

Implementation defaults for the previously open timing detail are recorded separately in [decision 014](014-weekly-competition-implementation-defaults.md).
