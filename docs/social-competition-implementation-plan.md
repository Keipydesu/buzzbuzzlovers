# Social competition — MVP implementation plan

Status: proposed plan for implementation, not yet built. Grounds decisions [011](decisions/011-social-competition-direction.md), [012](decisions/012-mvp-auth-and-competition-scope.md), and [013](decisions/013-mvp-scoring-and-invites.md) in concrete migrations and endpoints.

Direct schema check (2026-09-26): only `devices` and `posture_sessions` exist; no users/auth/groups tables. This plan adds them.

## 1. Auth and device ownership (prerequisite)

- `users`: `id`, `username` (unique, case-insensitive index), `password_digest` (`has_secure_password`), timestamps.
- `devices` gains `user_id` (nullable FK). **Correction (codex review):** no self-service enrollment endpoint for MVP. A `device_id` is a publicly observable BLE identifier; letting any logged-in user claim an arbitrary existing `device_id` would let them attach themselves to someone else's device and read/ride its data. For MVP, bindings are administrator-provisioned (e.g. a Rails console/rake task run by the operator, not a web endpoint), and once a device has session history under one user it is not silently reassigned — reassignment, if ever needed, is a separate explicit admin action, not part of this feature.
- Session mechanism: Rails signed cookie session for the browser dashboard. No token/API-key scheme needed since the browser already talks to the same Rails app.
- All existing and new reads/writes scope to `current_user` (Phase 3 roadmap item this unblocks).

## 2. Groups and membership

- `groups`: `id`, `name`, `created_by_user_id` (FK users), timestamps.
- `group_memberships`: `group_id`, `user_id`, timestamps, unique index on `(group_id, user_id)`.
- `group_invitations`: `id`, `group_id`, `code` (short unique random string, e.g. 8 chars, indexed), timestamps, optional `expires_at` (nullable — no expiry required for MVP per "keep it simple"). The invite **link** is `/groups/join/:code`; the **code** is the same value typed manually.
- **Correction (codex review):** the `GET /groups/join/:code` page only displays the invitation (group name, a "join" button); it must not create the membership as a side effect of the GET, since a prefetch/crawler/link-preview fetching that URL would otherwise silently join a stranger to a group. Joining happens via a CSRF-protected `POST` after the user is logged in, triggered by that button — still no human-approval step, just not tied to the unsafe GET.
- No per-invitation single-use restriction needed for MVP: a code can be reused by multiple friends joining the same group.

## 3. Scoring (read-time, no new tables)

Per decision 013, compute at read time from existing `posture_sessions`, joined through `devices.user_id`:

- For a group and a given week, for each member: `sum(slouch_seconds) / sum(tracked_seconds)` across that member's sessions whose `calendar_day` falls in the week, across all their devices. A member with `sum(tracked_seconds) == 0` for the week is unranked.
- Rank ascending by that ratio; ties share a rank (standard competition ranking, e.g. `RANK()` semantics).
- "Most improved" (non-ranking, decision 013): compare each member's current-week ratio to their immediately preceding week's ratio (both weeks must have tracked_seconds > 0 to be comparable). **Correction (codex review):** defined strictly as a positive percentage-point decrease; if no member's ratio actually improved, the stat shows nobody (not the least-worsened member as a fallback).
- **Correction (codex review):** week/date boundaries use one fixed application-wide timezone for MVP (the existing `demo_timezone` config, same one `BaseController#demo_timezone` already exposes), not each session's own stored `calendar_timezone`. `calendar_day`/`calendar_timezone` were computed per-session for the existing personal-stats feature and can legitimately differ session-to-session (e.g. travel, multiple devices); using them directly for group week-grouping would let two sessions in the same real week land in different "weeks" for ranking purposes. The read-time query re-buckets by the fixed app timezone instead of trusting the stored per-session bucket. This is a known limitation to note in the UI/docs, not solved further for MVP.
- **Open, not yet decided**: exact week start day and whether the leaderboard for the current, still-in-progress week updates live or only past/finalized weeks are ranked. Recommend live-updating, Monday-start weeks in the fixed app timezone (simplest, matches "prioritize working"). Still needs explicit operator sign-off before coding.

## 4. API / controllers

- `POST /users` (or `/signup`) — create account (username, password).
- `POST /session` / `DELETE /session` — login/logout.
- Device enrollment: administrator-provisioned (console/rake task), not a self-service endpoint — see section 1 correction.
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
