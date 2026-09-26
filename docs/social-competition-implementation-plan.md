# Social competition — MVP implementation plan

Status: proposed plan for implementation, not yet built. Grounds decisions [011](decisions/011-social-competition-direction.md), [012](decisions/012-mvp-auth-and-competition-scope.md), and [013](decisions/013-mvp-scoring-and-invites.md) in concrete migrations and endpoints.

Direct schema check (2026-09-26): only `devices` and `posture_sessions` exist; no users/auth/groups tables. This plan adds them.

## 1. Auth and device ownership (prerequisite)

- `users`: `id`, `username` (unique, case-insensitive index), `password_digest` (`has_secure_password`), timestamps.
- `devices` gains `user_id` (nullable FK, set on enrollment) — a device is enrolled to at most one user; a user can own multiple devices. Enrollment endpoint/flow needed before a device's sessions count toward any user's ranking.
- Session mechanism: Rails signed cookie session for the browser dashboard. No token/API-key scheme needed since the browser already talks to the same Rails app.
- All existing and new reads/writes scope to `current_user` (Phase 3 roadmap item this unblocks).

## 2. Groups and membership

- `groups`: `id`, `name`, `created_by_user_id` (FK users), timestamps.
- `group_memberships`: `group_id`, `user_id`, timestamps, unique index on `(group_id, user_id)`.
- `group_invitations`: `id`, `group_id`, `code` (short unique random string, e.g. 8 chars, indexed), timestamps, optional `expires_at` (nullable — no expiry required for MVP per "keep it simple"). The invite **link** is just `/groups/join/:code`; the **code** is the same value typed manually. Visiting the link or submitting the code both call the same join action and add the membership immediately — no approval step (decision 013).
- No per-invitation single-use restriction needed for MVP: a code can be reused by multiple friends joining the same group, since there is no mutual-approval concept to consume.

## 3. Scoring (read-time, no new tables)

Per decision 013, compute at read time from existing `posture_sessions`, joined through `devices.user_id`:

- For a group and a given week, for each member: `sum(slouch_seconds) / sum(tracked_seconds)` across that member's sessions whose `calendar_day` falls in the week, across all their devices. A member with `sum(tracked_seconds) == 0` for the week is unranked.
- Rank ascending by that ratio; ties share a rank (standard competition ranking, e.g. `RANK()` semantics).
- "Most improved" (non-ranking, decision 013): compare each member's current-week ratio to their immediately preceding week's ratio (both weeks must have tracked_seconds > 0 to be comparable); the largest decrease wins. Members with no comparable prior week are excluded from this stat, not shown as most improved by default.
- **Open, not yet decided**: exact week boundary (which day starts the week) and when a week counts as "finalized" (does the leaderboard for the current, still-in-progress week update live, or only past weeks are ranked?). Recommend: live-updating current week (simplest, matches "prioritize working"), with week starting Monday in each session's stored `calendar_timezone`. Needs explicit user sign-off before coding since decision 013 left it open.

## 4. API / controllers

- `POST /users` (or `/signup`) — create account (username, password).
- `POST /session` / `DELETE /session` — login/logout.
- `POST /devices/:device_id/enroll` — link a device to `current_user` (requires the device to already exist via the existing registration flow, or extend it).
- `POST /groups` — create a group (creator auto-joins).
- `GET /groups/:id` — group detail: members, current-week leaderboard, most-improved stat.
- `POST /groups/join` — body `{ code: "..." }`, or `GET /groups/join/:code` for the link form — both add `current_user` to the group.
- `GET /home` (or extend existing dashboard) — current user's group(s), rank, and current competition, alongside existing personal stats (decision 011 requires personal stats stay easy to reach).

## 5. UI

- Home: add a group/rank/current-competition section above or beside the existing personal dashboard (existing sample-data preview at `/` is unaffected structurally, just gains this section once real data exists).
- Group page: leaderboard table (rank, username, slouch share), most-improved callout, invite link/code display with a copy affordance.
- Simple login/signup forms; no password reset flow for MVP (not requested, skip it).

## 6. Explicitly out of scope for this pass

- Anti-cheat / minimum-coverage eligibility (decision 013 — trust-based MVP).
- Mutual-approval invites, username-search invites.
- Configurable competition period length (weekly only, decision 012).
- Historical week archival/finalization beyond whatever the week-boundary answer above implies.

## Sequencing

1. Users + auth + device enrollment (nothing else works without this).
2. Groups + memberships + invitations (link/code join).
3. Read-time leaderboard + most-improved query.
4. UI wiring.

Each step should land as its own reviewed change, same split as the PR #1 fixes: one agent implements, the other reviews independently before merge.
