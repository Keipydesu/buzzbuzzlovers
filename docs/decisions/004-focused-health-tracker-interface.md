# 004 — Use a simple, focused health-tracker interface

Date: 2026-09-26.

Status: accepted product and visual direction; layout and game mechanics still proposed.

## Context

During UI exploration, the user requested a gamified health-tracking system with a focused tracker presentation. They specified Georgia Tech colors: dark blue, gold accents, and white, with a simple design.

## Decision

Design the interface around clear measurements, history, and gamified progress. Use dark blue for dark surfaces, white for light surfaces and contrasting text, and gold as the accent. Keep the interface simple. This records the user's direction, not a completed UI or approval of particular reward mechanics.

Use the current Georgia Tech brand guide as the color reference: navy `#051E39`, gold `#B39051`, and white `#FFFFFF`. Prefer navy text on white and white text on navy; reserve gold for accents and progress. The guide notes that gold text on white fails its accessibility requirements. These values are the initial sketch tokens, subject to rendered contrast checks. [Georgia Tech colors](https://brand.gatech.edu/our-look/colors).

## Consequences

The health-tracker framing starts with posture awareness. It does not establish clinical benefits or add eye-strain sensing, movement detection, or other health measurements. Keep device-side classification and existing data-contract limits. New feature proposals need explicit scope decisions.

The next sketch should emphasize recorded metrics, weekly history, live state, and one compact goal/reward area. The exact hierarchy, default appearance, and amount of gamification remain discussion points. No application implementation or dependency change is authorized by this record.

## Related documents

- [Health research and CS-student rationale](../posture-health-research.md)
- [MVP scope](../MVP.md)
- [App plan](../APP_PLAN.md)
- [Device-side classification decision](001-device-side-posture-classification.md)
