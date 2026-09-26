# Playwright user-loop coverage

Date: 2026-09-26. Owner: Codex implementation; Claude independent review.

## Scope and acceptance

Cover the implemented browser user loop against real Rails and isolated PostgreSQL, with Chromium at 320 × 568 and 1280 × 900 plus mobile WebKit and desktop Firefox. Tests use rendered controls, independent browser sessions, actual cookies, Turbo navigation and CSRF protection. “Full” means every implemented user journey and its important failure branches below; it does not mean exhaustive code-path coverage or completed firmware/BLE integration.

| Journey | Required observations |
| --- | --- |
| Discover | Public introduction, truthful pairing note, account links, keyboard skip link |
| Accounts | Signup, normalization, duplicate username, password validation, failed/successful login, logout and denied private/API access |
| Personal tracking | Empty dashboard and seven-day gaps; synthetic device enrollment followed by real authenticated snapshot ingestion; saved totals after reload, duplicate/stale rejection semantics, ended session, account isolation |
| Groups | Empty list, validation, create, invite link/code, no automatic join, invite preserved through signup and login, repeated join idempotent, invalid invitation, private group denial, leave/rejoin |
| Competition | Weighted share, ordered/tied ranks, no-data member unranked, most-improved against prior week, dashboard standing, refresh after new uploads |
| Coach | Navigation, sharing notice, unavailable configuration, validation, deterministic successful and failed service responses without calling Meta |
| Presentation | Both themes and persistence, 320px overflow checks across all screens, labeled forms and usable primary controls, screenshots attached to reports |

## Implementation sequence

1. Review decisions 002, 004, 011–015, roadmap, mobile-first document, models/schema/migrations and API contract. Completed direct data-model review: users own devices/sessions; groups have memberships and one invitation; snapshots retain accepted revisions. No schema change or generated model-map task is needed.
2. Vet and pin Playwright; keep it development-only. Record provenance, dependency graph, advisory results and install behavior separately.
3. Build an isolated runner: fixed loopback server, dedicated `bbl_playwright_test` database, no `.env` or inherited database/Meta settings, no reuse of an existing app server. Test setup checks the actual connection before deleting synthetic records. Enable real CSRF for the browser server. One worker and fresh fixture reset per test prevent cross-test state.
4. Implement the matrix above. Use Rails runner only for fixture setup/admin device enrollment and deterministic service setup; account/group interactions remain browser-driven. Exercise ingestion through authenticated HTTP requests and then assert rendered results. No fake BLE success and no real Meta request.
5. Execute all browser projects, Rails regression tests, lint and whitespace checks. Retain local HTML report, failure traces and screenshots (ignored by Git). Fix application defects exposed by tests, with focused changes.
6. Hand off to Claude for independent plan/implementation/coverage review and a rerun. Resolve findings before declaring complete.

## Boundaries

Physical sensor behavior, Bluetooth permissions/reconnect/outbox, hosted TLS/Timescale operations, live Muse quality and production deployment need separate environments and are not claimed here. Existing Minitest tests remain responsible for exhaustive ingestion concurrency, integer boundaries, atomic history and rate-limit internals; browser tests cover their effects on the user journey. Browser emulation does not certify a physical phone or iPhone Bluetooth support.

## Execution and evidence

Commands, final counts, limitations and reviewer verdict will be recorded here after implementation. A green browser matrix plus the existing Rails suite and Claude's review are required for completion.

## Running locally

Use the repository's pinned Ruby/gems, Node/npm and PostgreSQL listening on `127.0.0.1:5432`; the local OS user needs permission to create the dedicated database. Review [the dependency evidence](playwright-dependency-review.md), then run:

```sh
npm ci --ignore-scripts --omit=optional
npx playwright install chromium firefox webkit
npm run test:e2e
# Narrow a debugging run:
npm run test:e2e -- --project=mobile-chromium
npm run test:e2e:report
```

The runner starts and stops its own Rails/Puma server on port 3118. An occupied port fails rather than reusing an unknown server. It uses only `bbl_playwright_test`, clears that database's synthetic app records before each test, and leaves local development/demo and hosted databases untouched. Never store useful data in this reserved test database. Run only one suite at a time. Normal retries are disabled so failures are visible. All four projects execute the same journeys.

`test/e2e/support/environment.js` supplies an explicit environment allowlist to Rails subprocesses; inherited database URLs, PostgreSQL overrides and Meta credentials are excluded. The destructive fixture runner verifies Rails test mode, the E2E flag, loopback configuration and the actual database name before deleting anything. There are no test-only HTTP routes. The Rack test entrypoint freezes server time to September 23, 2026 so personal dates and weekly comparisons are reproducible and enables CSRF protection.

Coach success/failure responses replace the Ruby adapter **only inside the guarded test Rack entrypoint**. The browser tests exercise actual controller validation, form submissions, response rendering and escaping, but do not test Meta transport. The ordinary app adapter and endpoint are unchanged; its existing Ruby test covers DNS failure; live transport and provider response compatibility require a separate integration check. The normal unavailable-configuration state is covered too.

Screenshots and failure traces contain only synthetic users and are written under ignored `test-results/` and `playwright-report/`. Reports can contain session cookies, so do not attach reports from real accounts. No baseline image comparison or hardware certification is claimed by layout assertions.

## Defects exposed during implementation

- An invalid invitation code previously returned a 404 to Turbo without useful form feedback. It now returns to the groups page with a visible alert; the Rails request test and browser recovery journey cover it.
- Maximum-length unbroken group/member names overflowed in mobile WebKit. Scoped wrapping rules now keep those names within the viewport, including the invitation heading.
- Repeated account switching exposed a late Turbo hover-prefetch response overwriting the logged-out cookie with the previous user's cookie. Trace order confirmed a prefetch of `/` began before logout and completed after the anonymous login page. The layout now disables speculative prefetching, preserving ordinary Turbo navigation. A browser-clock regression verifies hovering does not issue a prefetch and logout still denies API access. This fixes the observed background-request trigger; server-side session revocation for arbitrary concurrent requests remains outside this test/UI change.

Tests wait for completed Turbo renders and theme transitions, rather than using fixed sleeps or automatic retries. WebKit's link keyboard traversal uses Alt+Tab; the other projects use Tab.

## Test locations

- [Accounts](../test/e2e/accounts.spec.js): six journeys covering discovery, signup/login/logout, validation, protected routes/CSRF and prefetch regression.
- [Groups](../test/e2e/groups.spec.js): four journeys covering creation/code joining/leaving, separate signup and login invitation returns, and invalid invitation recovery.
- [Tracking](../test/e2e/tracking.spec.js): three journeys covering real ingestion/persistence/isolation, weighted weekly competition/improvement, and zero-duration versus missing data.
- [Coach and layout](../test/e2e/coach-layout.spec.js): two journeys covering deterministic coach responses and every implemented screen in both themes, with maximum-length names at phone width.
- [Runner configuration](../playwright.config.js) executes all 15 journeys in each of four projects (60 cases), with one worker, zero retries and failure artifacts.

## Implementation verification

Codex verified September 26, 2026:

- Full `npm run test:e2e`: **60 passed**, all four projects, zero retries, approximately 2.1 minutes.
- Race-focused `--grep 'competition weights|hovering navigation' --repeat-each=3`: **24 passed**, all four projects.
- Rails regression command from [local demo](local-demo.md): **91 runs, 377 assertions, 0 failures/errors**, one expected Timescale-only skip on ordinary local PostgreSQL.
- `bin/rubocop --cache false`: **84 files**, no offenses. JavaScript syntax, whitespace and relative documentation links checked.
- `npm audit`: zero known advisories for the locked tree. `npm ls --all` confirms optional `fsevents` is absent. The fixture-reset negative check refused execution when `BBL_E2E=0` disabled the required test flag.

Claude independently reviewed every test/support file and application diff, then reran the full browser matrix (**60/60**), Rails suite (**91/377**, no failures, one expected skip), RuboCop (**84 clean**), npm audit (**zero advisories**) and whitespace checks. Review found no coverage gaps against the journey table. Both Codex and Claude recorded **AGREE** on September 26, 2026 (Talking Stick events 1919–1921). Implementation and review are complete.
