# Sums counters once per session (never per snapshot, never averaging per-session
# percentages), per docs/app-api.md "Read responses and summary semantics".
class DailySummaryQuery
  def self.call(date:)
    sessions = PostureSession.on_calendar_day(date)

    tracked_seconds = sessions.sum(:tracked_seconds)
    slouch_seconds = sessions.sum(:slouch_seconds)
    non_slouch_seconds = tracked_seconds - slouch_seconds

    {
      session_count: sessions.count,
      incomplete_session_count: sessions.where(ended: false).count,
      tracked_seconds: tracked_seconds,
      slouch_seconds: slouch_seconds,
      non_slouch_seconds: non_slouch_seconds,
      episode_count: sessions.sum(:episode_count),
      non_slouch_percent: tracked_seconds.zero? ? nil : (100.0 * non_slouch_seconds / tracked_seconds).round(2)
    }
  end
end
