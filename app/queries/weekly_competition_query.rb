class WeeklyCompetitionQuery
  Entry = Struct.new(:user, :tracked_seconds, :slouch_seconds, :ratio, :rank, :improvement, keyword_init: true)
  Result = Struct.new(:week_start, :week_end, :timezone, :entries, :most_improved, keyword_init: true)

  def initialize(group:, now: Time.current)
    @group = group
    @now = now
  end

  def call
    timezone = Rails.application.config.x.demo_timezone
    week_start = @now.in_time_zone(timezone).to_date.beginning_of_week(:monday)
    boundary = week_start.in_time_zone(timezone)
    previous_boundary = (week_start - 7).in_time_zone(timezone)
    next_boundary = (week_start + 7).in_time_zone(timezone)
    users = @group.users.order(:username).to_a
    # First observation is an instant. Grouping in one fixed zone does not
    # rewrite personal buckets or pretend to split a session's activity.
    period_sql = "CASE WHEN first_observed_at >= #{PostureSession.connection.quote(boundary)} THEN 1 ELSE 0 END"
    totals = PostureSession.where(user_id: users.map(&:id), first_observed_at: previous_boundary...next_boundary)
      .group(:user_id, Arel.sql(period_sql))
      .pluck(:user_id, Arel.sql(period_sql), Arel.sql("SUM(tracked_seconds)"), Arel.sql("SUM(slouch_seconds)"))
      .to_h { |user_id, period, tracked, slouch| [ [ user_id, period ], [ tracked, slouch ] ] }

    entries = users.map do |user|
      tracked, slouch = totals.fetch([ user.id, 1 ], [ 0, 0 ])
      previous_tracked, previous_slouch = totals.fetch([ user.id, 0 ], [ 0, 0 ])
      ratio = Rational(slouch, tracked) if tracked.positive?
      previous_ratio = Rational(previous_slouch, previous_tracked) if previous_tracked.positive?
      improvement = (previous_ratio - ratio) * 100 if previous_ratio && ratio
      Entry.new(user: user, tracked_seconds: tracked, slouch_seconds: slouch, ratio: ratio, improvement: improvement)
    end
    # Rational comparison avoids rounded display percentages creating false ties.
    entries.sort_by! { |entry| [ entry.ratio.nil? ? 1 : 0, entry.ratio || 0, entry.user.username ] }
    previous_ratio = nil
    rank = nil
    entries.each_with_index do |entry, index|
      next unless entry.ratio
      rank = index + 1 if entry.ratio != previous_ratio
      entry.rank = rank
      previous_ratio = entry.ratio
    end
    maximum_improvement = entries.filter_map(&:improvement).select(&:positive?).max
    most_improved = maximum_improvement ? entries.select { |entry| entry.improvement == maximum_improvement } : []
    Result.new(week_start: week_start, week_end: week_start + 6, timezone: timezone, entries: entries, most_improved: most_improved)
  end
end
