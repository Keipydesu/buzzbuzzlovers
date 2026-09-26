# Mobile-first interface

Mobile usability is the first UI priority for bbl. Design and verify the smallest phone layout before expanding it for tablets and desktops. This applies to the public introduction, account forms, personal history, and friend-group competition.

## Product direction

Preserve the simple navy, gold, and white tracker style from [decision 004](decisions/004-focused-health-tracker-interface.md) and the original Rails scaffold. Support light and dark themes. Use gold for accents and buttons; use the theme's accessible accent-text color for text on light surfaces.

Visitors at `/` see an introduction with account creation and login links. Signed-in users at the same address see their saved dashboard. Login and signup use the same visual language. Private group and tracking data remain behind authentication.

On the dashboard, keep personal statistics easy to reach alongside the friend competition, per [decision 011](decisions/011-social-competition-direction.md). The compact phone layout in [decision 009](decisions/009-compact-goal-above-today.md) is a useful earlier layout reference; its sample goal is not a current feature. The saved-data behavior in [decision 014](decisions/014-weekly-competition-implementation-defaults.md) takes precedence over historical preview charts.

## Layout and interaction requirements

- Start at 320 CSS pixels wide. Content must wrap without horizontal page scrolling or clipped controls; expand to multiple columns only when space allows.
- Keep primary actions prominent and touch controls at least 44 pixels high on landing and account pages. Avoid tiny links as the only way to continue.
- Give form fields visible labels, readable input text, appropriate autocomplete, and connected hint text. Keep errors visible and keyboard focus clear in both themes.
- Keep navigation usable when it wraps. Let long pages scroll vertically; do not hide form fields or error messages to fit one screen.
- Prioritize the main message and next action on the landing page. Any illustrative chart is decorative and explicitly labeled as sample content, separate from saved activity.
- Validate desktop as well as phone layouts. A wider viewport should improve spacing without changing core tasks or data semantics.

## Browser and hardware boundary

Mobile-first describes the interface, not universal Bluetooth support. The initial wearable demo uses a compatible laptop browser; an iPhone layout does not imply iPhone Bluetooth pairing. Browser BLE integration remains unfinished. The landing page states that wearable pairing is coming soon, while account and group setup are available. See [the MVP](MVP.md), [BLE protocol](ble-protocol.md), and [local demo](local-demo.md).

## Verification for landing and account changes

Check `/`, `/login`, and `/signup` at 320 × 568 and a desktop width, including both themes, persisted theme choice, visible labels, validation errors, and clear account-switch links. Confirm anonymous root returns the introduction, authenticated root returns saved data, and groups/API still require authentication. Preserve invitation return paths through login and signup.

Direct review of models, schema, and all five migrations found no data-model changes necessary for this UI work. Tests must use isolated local PostgreSQL. No generated model map or model-map verification task exists in this repository.

Verified September 26, 2026: 91 Rails tests / 373 assertions passed with one expected Timescale-only skip, using the isolated local `bbl_competition_test_20260926` database and the environment-isolated command in [local demo](local-demo.md). RuboCop inspected 81 files with no offenses. Whitespace checks passed. Chrome review covered the landing and account pages at 320px, desktop landing/signup at 1280px, both themes, theme persistence between pages, login failure feedback, and scrolling to signup actions. Measured document width was 320px on all three mobile pages. No new dependencies, schema changes, or live Tiger data access were involved.
