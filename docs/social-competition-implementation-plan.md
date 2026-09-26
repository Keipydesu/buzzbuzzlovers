# Social competition — MVP implementation plan

Status: implemented locally and independently reviewed by Claude. Grounds decisions [011](decisions/011-social-competition-direction.md), [012](decisions/012-mvp-auth-and-competition-scope.md), and [013](decisions/013-mvp-scoring-and-invites.md) in concrete migrations and endpoints.

Direct model/schema/migration review (2026-09-26): users, devices, posture_sessions, groups, group_memberships and group_invitations now exist. No score/archive table or generated model-map task is present. See [account setup](authentication-mvp.md) for the migration and dependency review.

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

Per decision 013, compute at read time from existing `posture_sessions`, scoped by the immutable `posture_sessions.user_id`:

- For a group and a given week, for each member: `sum(slouch_seconds) / sum(tracked_seconds)` across that member's sessions whose `first_observed_at` falls in the fixed app timezone's week, across all their devices. A member with `sum(tracked_seconds) == 0` for the week is unranked.
- Rank ascending by that ratio; ties share a rank (standard competition ranking, e.g. `RANK()` semantics).
- "Most improved" (non-ranking, decision 013): compare each member's current-week ratio to their immediately preceding week's ratio (both weeks must have tracked_seconds > 0 to be comparable). **Correction (codex review):** defined strictly as a positive percentage-point decrease; if no member's ratio actually improved, the stat shows nobody (not the least-worsened member as a fallback).
- **Correction (codex review):** week/date boundaries use one fixed application-wide timezone for MVP (the existing `demo_timezone` config, same one `BaseController#demo_timezone` already exposes), not each session's own stored `calendar_timezone`. `calendar_day`/`calendar_timezone` were computed per-session for the existing personal-stats feature and can legitimately differ session-to-session (e.g. travel, multiple devices); using them directly for group week-grouping would let two sessions in the same real week land in different "weeks" for ranking purposes. The read-time query re-buckets by the fixed app timezone instead of trusting the stored per-session bucket. This is a known limitation to note in the UI/docs, not solved further for MVP.
- Implemented default: live-on-refresh Monday–Sunday weeks in the fixed app timezone; late data can revise prior totals. There is no archive/finalization job. See [decision 014](decisions/014-weekly-competition-implementation-defaults.md).

## 4. API / controllers

- `POST /signup` — create account (username, password).
- `POST /login` / `DELETE /logout` — login/logout.
- Device enrollment: administrator-provisioned (console/rake task), not a self-service endpoint — see section 1 correction.
- `POST /groups` — create a group (creator auto-joins).
- `GET /groups/:id` — group detail: members, current-week leaderboard, most-improved stat.
- `GET /groups/join/:code` displays the invite and preserves it through signup/login. `POST /groups/join` with `{ code: "..." }` joins idempotently. `DELETE /groups/:id/leave` removes only the current membership.
- `GET /home` (or extend existing dashboard) — current user's group(s), rank, and current competition, alongside saved personal stats (decision 011 requires personal stats stay easy to reach).

## 5. UI

- Home: add a group/rank/current-competition section above or beside the existing personal dashboard (replaces the synthetic hero and activity preview with saved group standings and personal totals).
- Group page: leaderboard table (rank, username, slouch share), most-improved callout, invite link/code display as selectable text.
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


## Current validation and boundaries

The implementation uses one canonical-total aggregation for both competition weeks, exact ratios for ties, and positive percentage-point improvement. It never sums snapshot history or gives no-data users a winning zero. Group members see only usernames, competition aggregates, coverage, and improvement; personal session endpoints stay owner-only. Invite codes are reusable until the group is removed administratively; there is no expiry/rotation UI in this MVP.

Full local suite: 81 tests, 341 assertions, no failures/errors after final doc/layout adjustments. RuboCop: 74 files clean. Browser verification used only synthetic accounts in the disposable local database: signup -> create group -> logout -> invitation -> friend signup -> explicit join -> both members visible. Inspected desktop and 390×844 leaderboard layouts. No physical tracker, BLE upload client or hosted rollout has been tested.

Claude independently reviewed the full diff and reran all 81 tests (341 assertions), RuboCop (74 files) and Brakeman (zero warnings), returning AGREE with no blocking competition findings. Both implementation slices are committed locally; pushing/deployment is separate.

Subsequent integration merges the Tiger DB changes from main and retains atomic accepted-snapshot history. See [local demo](local-demo.md); the immediate MVP target is local, while Tiger support is retained.
