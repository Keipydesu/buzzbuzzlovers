# 009 — Put a compact daily goal above today's stats

Date: 2026-09-26.

Status: accepted layout refinement; supersedes the strict first-section ordering in decisions 007 and 008.

## Context

The user requested removal of the implied overview heading and subtitle, a smaller daily goal at the very top, and today's stats visible on a phone screen.

## Decision

After the bbl header, show a compact daily-goal strip with a small progress ring. Place today's episode count, tracked duration, and slouch duration above the daily frequency bars. Remove the overview title, introductory copy, and large goal card. Habit trends remain the main dashboard content.

## Consequences

The goal strip is 70px tall at mobile widths. Browser verification at 320 × 568 found all three daily totals visible without scrolling, with their containing row ending at approximately 357px. Also checked the 390 × 844 layout and both themes. Chart semantics, sample-data implementation, and device qualification requirements remain unchanged.

The tracking-duration goal example is superseded by [decision 010](010-reward-slouch-reduction.md).

## Related documents

- [Habit-trend hierarchy](007-lead-with-habit-trends.md)
- [Daily frequency bars](008-daily-frequency-bars.md)
- [Subtle gamification](005-subtle-gamification.md)
