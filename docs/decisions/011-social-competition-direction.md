# 011 — Make friend-group competition a major app experience

Date: 2026-09-26.

Status: accepted product direction; further implementation deferred at the user's request.

## Context

The user wants gamification to be social: create a group, compete with friends, and see rankings. Competition should be a large part of bbl rather than a small reward attached to personal tracking. The user then asked to jot this down and return to the idea later.

## Decision

Make friend groups and rankings central to the future app experience. This supersedes the exclusively subtle, personal gamification emphasis in [decision 005](005-subtle-gamification.md) and the personal daily goal emphasis in [decision 010](010-reward-slouch-reduction.md). The underlying aim remains improving habits, not accumulating sitting or slouching time.

Keep today's personal statistics easy to reach, including on phones. Preserve the simple navy, gold, and white design and dark mode.

## Ideas to revisit

- A prominent home section showing the user's group, rank, and the current competition.
- Group creation, friend invitations, a leaderboard, and a clear explanation of scoring.
- Weekly competitions, possibly based on lowest slouch share or improvement from an individual baseline. Neither scoring option is finalized.
- Fair comparison rules for recording coverage, missing data, ties, and different starting points. The illustrative two-hour/three-day eligibility rule is not an accepted requirement.
- Meta Muse Spark as a separate ergonomics helper: users can ask about recurring desk habits and receive practical suggestions about their setup. The user reports having API tokens; exact model access and integration still need verification. Never put tokens in documentation.

## Consequences

Pause further implementation and return to these choices with the user. Existing in-progress group UI and Muse adapter work is not a completed or verified integration. Group fixtures and URL-based group naming do not create saved groups or real competitions.

A direct review of `app/models/`, `db/schema.rb`, and migrations found only devices and posture sessions, with cumulative tracking measurements. Accounts, memberships, invitations, and durable rankings do not exist. No schema change or runtime test was performed for this documentation update. Authentication, member authorization, scoring, and sharing rules must be resolved before real social competition ships.

Earlier scope exclusions for leaderboards in the MVP, roadmap, and app plan describe the original scope; this record accepts the new direction without claiming those features have landed. Detailed implementation planning is deferred.

## Related documents

- [Roadmap](../ROADMAP.md)
- [MVP](../MVP.md)
- [App plan](../APP_PLAN.md)
- [Slouch qualification rule](006-one-minute-slouch-qualification.md)
