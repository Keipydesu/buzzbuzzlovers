module Muse
  # A short plain-text summary of the user's own tracked totals (today and
  # the last 7 days, per docs/APP_PLAN.md's first-observed-date grouping),
  # for Coach to pass to Muse as background. Self-reported by the wearable,
  # not independently verified — the prompt in Coach::INSTRUCTIONS says so.
  class ContextSummary
    def self.call(user, analysis: false, timezone: Rails.application.config.x.demo_timezone)
      today = Time.current.in_time_zone(timezone).to_date
      week = (0..6).map { |offset| DailySummaryQuery.call(date: today - offset, sessions: user.posture_sessions) }
      today_summary = week.first
      weekly_tracked = week.sum { |day| day[:tracked_seconds] }
      weekly_slouch = week.sum { |day| day[:slouch_seconds] }
      weekly_episodes = week.sum { |day| day[:episode_count] }

      purpose = analysis ? "Requested analysis evidence:" : "Background only, not asked by the user:"
      summary = <<~TEXT
        #{purpose} their own tracked posture totals from their wearable, self-reported and not clinically verified. Use only if relevant to their request; never diagnose from these totals.
        Sessions are grouped by first-seen date in #{timezone}, not by when each minute of activity occurred. Cross-midnight sessions are not split. Totals include saved partial/incomplete sessions and exclude unsaved or unobserved activity; no recorded time does not establish no activity.
        Today (#{today}): #{format_minutes(today_summary[:tracked_seconds])} tracked, #{format_minutes(today_summary[:slouch_seconds])} in a detected slouch, #{today_summary[:episode_count]} slouch episode(s).
        Last 7 days: #{format_minutes(weekly_tracked)} tracked, #{format_minutes(weekly_slouch)} in a detected slouch, #{weekly_episodes} slouch episode(s).
      TEXT
      return summary unless analysis

      share = weekly_tracked.zero? ? "There is not enough recorded data to analyze; do not report a percentage." :
        "Slouch share of recorded device time: #{(100.0 * weekly_slouch / weekly_tracked).round(1)}%."
      summary + <<~TEXT
        #{share}
        Coverage: #{week.count { |day| day[:tracked_seconds].positive? }} of 7 first-seen dates have positive recorded tracking time. Sparse coverage does not establish consistency or a repeated habit.
        These are summed device totals, not unique personal elapsed time; multiple devices may overlap. No hour-of-day pattern, activity, or cause can be inferred. Do not infer improvement from unequal recording coverage, or describe unobserved time as upright.
      TEXT
    end

    def self.format_minutes(seconds)
      "#{(seconds / 60.0).round(1)} min"
    end
  end
end
