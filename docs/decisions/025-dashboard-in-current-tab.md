# 025 — Open the dashboard in the current tab

Date: 2026-09-26.

Status: accepted user direction; supersedes new-tab dashboard navigation in
[decision 019](019-separate-pairing-and-weekly-chart.md) and
[decision 024](024-guided-wearable-setup.md).

## Context

The user requested that Go to dashboard use the current tab.

## Decision

After calibration, Go to dashboard navigates to `/` in the current tab.

## Consequences

The navigation-disconnect limitation below is superseded by
[decision 026](026-preserve-bluetooth-across-app-navigation.md).

Leaving the wearable page disconnects its Bluetooth transport. The existing
unsaved-readings confirmation remains active; saved history is retained. This
does not add background tracking or change the data model.

## Related documents

- [Guided setup](024-guided-wearable-setup.md)
