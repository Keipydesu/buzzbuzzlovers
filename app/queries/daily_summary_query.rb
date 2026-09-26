# Sums counters once per session (never per snapshot, never averaging per-session
# percentages), per docs/app-api.md "Read responses and summary semantics".
class DailySummaryQuery
  def self.call(date:)
    row = PostureSession.on_calendar_day(date).pick(
      Arel.sql("COUNT(*)"),
      Arel.sql("COUNT(*) FILTER (WHERE NOT ended)"),
      Arel.sql("COALESCE(SUM(tracked_seconds), 0)::bigint"),
      Arel.sql("COALESCE(SUM(slouch_seconds), 0)::bigint"),
      Arel.sql("COALESCE(SUM(episode_count), 0)::bigint")
    )

    session_count, incomplete_session_count, tracked_seconds, slouch_seconds, episode_count = row
    non_slouch_seconds = tracked_seconds - slouch_seconds

    {
      session_count: session_count,
      incomplete_session_count: incomplete_session_count,
      tracked_seconds: tracked_seconds,
      slouch_seconds: slouch_seconds,
      non_slouch_seconds: non_slouch_seconds,
      episode_count: episode_count,
      non_slouch_percent: tracked_seconds.zero? ? nil : (100.0 * non_slouch_seconds / tracked_seconds).round(2)
    }
  end
end
