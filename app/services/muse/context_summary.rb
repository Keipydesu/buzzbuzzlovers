module Muse
  # A short plain-text summary of the user's own tracked totals (today and
  # the last 7 days, per docs/APP_PLAN.md's first-observed-date grouping),
  # for Coach to pass to Muse as background. Self-reported by the wearable,
  # not independently verified — the prompt in Coach::INSTRUCTIONS says so.
  class ContextSummary
    def self.call(user, timezone: Rails.application.config.x.demo_timezone)
      today = Time.current.in_time_zone(timezone).to_date
      today_summary = DailySummaryQuery.call(date: today, sessions: user.posture_sessions)
      week = (0..6).map { |offset| DailySummaryQuery.call(date: today - offset, sessions: user.posture_sessions) }
      weekly_tracked = week.sum { |day| day[:tracked_seconds] }
      weekly_slouch = week.sum { |day| day[:slouch_seconds] }
      weekly_episodes = week.sum { |day| day[:episode_count] }

      <<~TEXT
        Background only, not asked by the user: their own tracked posture totals from their wearable, self-reported and not clinically verified. Use only if relevant to their question; do not recite the numbers back unprompted or diagnose from them.
        Today: #{format_minutes(today_summary[:tracked_seconds])} tracked, #{format_minutes(today_summary[:slouch_seconds])} in a detected slouch, #{today_summary[:episode_count]} slouch episode(s).
        Last 7 days: #{format_minutes(weekly_tracked)} tracked, #{format_minutes(weekly_slouch)} in a detected slouch, #{weekly_episodes} slouch episode(s).
      TEXT
    end

    def self.format_minutes(seconds)
      "#{(seconds / 60.0).round(1)} min"
    end
  end
end
