module SessionSerializer
  def self.call(session)
    {
      device_id: session.device_id,
      device_session_id: session.device_session_id,
      snapshot: {
        protocol_version: session.protocol_version,
        state: session.state,
        sequence: session.last_sequence,
        tracked_seconds: session.tracked_seconds,
        slouch_seconds: session.slouch_seconds,
        episode_count: session.episode_count
      },
      ended: session.ended,
      first_observed_at: session.first_observed_at.iso8601,
      first_received_at: session.first_received_at.iso8601,
      last_received_at: session.last_received_at.iso8601,
      calendar_day: session.calendar_day.iso8601,
      calendar_timezone: session.calendar_timezone
    }
  end
end
