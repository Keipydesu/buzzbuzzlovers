# 010 — Make the daily goal about reducing slouch time

Date: 2026-09-26.

Status: accepted goal direction; numerical target and baseline policy proposed for the mockup.

The personal daily goal emphasis is superseded by [decision 011](011-social-competition-direction.md). Improving habits remains the aim; competitive scoring is undecided.

## Context

The user found the tracking-duration goal misleading and clarified that the goal should encourage less slouching. This supersedes the tracking-minute example used in decisions 005 and 009.

## Decision

Make the compact goal about reducing slouch time. In the mockup, compare slouch duration as a share of recorded tracking time against the weighted share from previous recorded days, excluding today and no-data days. This prevents a shorter recording alone from appearing as improvement.

Use an illustrative 20% relative reduction target. The target, baseline window, minimum coverage, and final reward eligibility still require product agreement; the user accepted the reduction direction, not this exact number. The ring fills as reduction improves, not as slouch minutes accumulate. Show progress or on-track status, never a completed daily reward while tracking is still underway.

## Consequences

Without current data or a usable positive baseline, show a baseline-building state instead of success. A zero-slouch baseline needs a separately agreed maintenance goal. The preview computes rates from synthetic values only. Firmware still owns episode qualification.

The existing API `ChallengeQuery` still contains the previous 20-minute/50-point prototype. It is not connected to this mockup and must be replaced after baseline, coverage, calendar allocation, and reward rules are agreed. This UI iteration does not silently change that API contract or claim that the new rewards are implemented end to end.

## Related documents

- [Subtle gamification](005-subtle-gamification.md)
- [Compact goal layout](009-compact-goal-above-today.md)
- [API contract](../app-api.md)
