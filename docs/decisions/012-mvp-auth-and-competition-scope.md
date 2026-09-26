# 012 — Simple auth and weekly competition scope for MVP

Date: 2026-09-26.

Status: accepted for username/password auth and weekly competition period; scoring basis and invite model proposed, not yet confirmed.

## Context

Following [decision 011](011-social-competition-direction.md), the user asked to keep the MVP simple and prioritize a working system over a polished one. The user specified simple username/password authentication and confirmed weekly competition splits.

## Decision

- Authentication: plain username + password (`has_secure_password`), no OAuth/SSO/email verification for MVP. Sessions via Rails' standard cookie session or a simple bearer token for the browser client; exact mechanism left to implementation, but no third-party identity provider.
- Competition period: weekly, non-configurable for MVP (matches decision 011's "weekly competitions" idea).

## Still open (proposed defaults, need explicit confirmation before implementation)

- Scoring basis: recommend lowest slouch-share for the week over improvement-from-baseline for MVP simplicity — it needs no baseline history, just the current week's tracked/slouch totals. Improvement-from-baseline can follow post-MVP if the user wants fairness across different desk setups.
- Group invites: recommend invite-link based (a shareable code/token) over mutual-approval requests, for the same simplicity reason.
- Eligibility/coverage rule: still needs a real minimum-tracked-time rule to replace the illustrative two-hour/three-day example in 011; not yet proposed.

## Consequences

Unblocks starting the data model (users, groups, group_memberships, invitations) and auth flow. Scoring computation and eligibility rules should not be implemented until the two open items above are confirmed, to avoid rework.

## Related documents

- [Social competition direction](011-social-competition-direction.md)
- [Roadmap](../ROADMAP.md)
