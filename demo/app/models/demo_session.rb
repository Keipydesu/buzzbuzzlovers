class DemoSession < ApplicationRecord
  FIELDS = %w[protocol_version state sequence tracked_seconds slouch_seconds episode_count].freeze
  STATES = %w[idle calibrating upright slouching sensor_error ended].freeze
  class Invalid < StandardError; end
  class Conflict < StandardError; end

  def self.ingest(id, input)
    raise Invalid, "Invalid session ID" unless id.to_s.match?(/\A[1-9][0-9]*\z/) && id.to_i <= 4294967295
    raise Invalid, "Unexpected request fields" unless input.is_a?(Hash) && input.keys.sort == %w[first_observed_at snapshot]
    snapshot = input["snapshot"]
    raise Invalid, "Snapshot fields do not match protocol" unless snapshot.is_a?(Hash) && snapshot.keys.sort == FIELDS.sort
    raise Invalid, "Unsupported protocol or state" unless snapshot["protocol_version"] == 1 && snapshot["protocol_version"].is_a?(Integer) && STATES.include?(snapshot["state"])
    {"sequence" => 1..4294967295, "tracked_seconds" => 0..4294967295, "slouch_seconds" => 0..4294967295, "episode_count" => 0..65535}.each do |key, range|
      raise Invalid, "Invalid #{key}" unless snapshot[key].is_a?(Integer) && range.cover?(snapshot[key])
    end
    raise Invalid, "Slouch duration exceeds tracked time" if snapshot["slouch_seconds"] > snapshot["tracked_seconds"]
    timestamp = input["first_observed_at"]
    raise Invalid, "Timestamp must include timezone" unless timestamp.is_a?(String) && timestamp.match?(/(?:Z|[+-]\d{2}:\d{2})\z/)
    begin
      observed = Time.iso8601(timestamp)
    rescue ArgumentError
      raise Invalid, "Invalid observation timestamp"
    end
    raise Invalid, "Observation is in the future" if observed > Time.current + 5.minutes
    # SQLite immediate transactions serialize competing inserts and updates.
    transaction do
      row = find_by(id: id)
      if row
        if snapshot["sequence"] < row.sequence
          return ["stale", row]
        elsif snapshot["sequence"] == row.sequence
          raise Conflict, "This revision has different recorded values" unless row.attributes.slice(*FIELDS) == snapshot
          return ["duplicate", row]
        end
        raise Conflict, "Ended sessions cannot reopen" if row.state == "ended"
        %w[tracked_seconds slouch_seconds episode_count].each do |key|
          raise Invalid, "Counter regression: #{key}" if snapshot[key] < row[key]
        end
        row.update!(snapshot)
      else
        row = create!(snapshot.merge(id: id.to_i, first_observed_at: observed, calendar_day: observed.in_time_zone.to_date, calendar_timezone: Time.zone.tzinfo.name))
      end
      ["accepted", row]
    end
  end

  def self.summary(rows)
    tracked = rows.sum(&:tracked_seconds)
    slouch = rows.sum(&:slouch_seconds)
    {session_count: rows.size, incomplete_session_count: rows.count { |s| s.state != "ended" }, tracked_seconds: tracked,
     slouch_seconds: slouch, non_slouch_seconds: tracked - slouch, episode_count: rows.sum(&:episode_count),
     non_slouch_percent: tracked.zero? ? nil : ((tracked - slouch) * 100.0 / tracked).round(2)}
  end

  def self.dashboard
    days = (6.days.ago.to_date..Date.current).map { |day| {date: day.iso8601, summary: summary(where(calendar_day: day).to_a)} }
    today = days.last[:summary]
    {mode: "simulation", timezone: Time.zone.tzinfo.name, grouping: "first_observed_date", days: days, today: today,
     challenge: {target_seconds: 1200, progress_seconds: [today[:tracked_seconds], 1200].min, earned_points: today[:tracked_seconds] >= 1200 ? 50 : 0},
     sessions: order(id: :desc).limit(30).map(&:as_json), next_session_id: [maximum(:id).to_i + 1, Time.current.to_i].max}
  end
end
