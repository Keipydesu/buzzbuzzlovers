# 030 — Continuing Muse chat with motion

Date: 2026-09-26.

Status: accepted user request; supersedes the static sample conversation in decision 029.

The requirement to set a model explicitly is superseded by
[decision 031](031-muse-api-key-setup.md); conversation and demo behavior remain unchanged.

## Decision

Replace the sample transcript with an interactive chat at the bottom of the dashboard and landing page, and reuse it on the coach page. Keep the existing color themes. Add message entrances, a thinking indicator, gentle avatar motion, and input/button transitions; respect reduced-motion preferences.

When Muse is configured and the user is authenticated, use the server-owned conversation implementation merged in PR #7: current question, up to six recent exchanges, and the account-scoped tracked-total summary go to the provider. The chat discloses these fields and the calendar limitations. Client-supplied history is ignored. Live history remains in bounded local process memory for up to 30 minutes of inactivity, survives page reload, and is cleared by the server reset endpoint. The animated interface uses JSON responses; HTML form posts retain the upstream redirect-after-success behavior.

When live Muse is unavailable or the viewer is signed out, provide explicitly labeled local scripted demo replies. Never present these as model-generated output. This keeps the public preview usable without credentials or provider calls. Actual replies require the existing META_MUSE_API_KEY and META_MUSE_MODEL environment configuration and a signed-in account.

## Verification and boundaries

The combined Rails request/service tests and four JavaScript controller tests cover server-owned conversation context, account isolation, errors, reset races, and late responses. No live provider request or browser visual verification was performed. No new dependencies or data-model changes.

## Related

- [Earlier posture context and static sample](029-posture-context-and-muse-sample.md)
- [Visual direction](004-focused-health-tracker-interface.md)
