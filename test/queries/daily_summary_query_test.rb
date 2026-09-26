require "test_helper"

class DailySummaryQueryTest < ActiveSupport::TestCase
  test "computes the day's totals in a single aggregate query" do
    device = Device.register("00112233445566778899aabbccddeeff").device
    now = Time.current
    PostureSession.create!(
      device: device, device_session_id: 1, protocol_version: 1, last_sequence: 1,
      state: "upright", tracked_seconds: 60, slouch_seconds: 10, episode_count: 1,
      first_received_at: now, last_received_at: now, first_observed_at: now,
      calendar_timezone: "America/New_York", calendar_day: now.to_date
    )

    select_count = 0
    subscriber = ->(*, payload) { select_count += 1 if payload[:sql].match?(/\ASELECT/i) }

    ActiveSupport::Notifications.subscribed(subscriber, "sql.active_record") do
      DailySummaryQuery.call(date: now.to_date)
    end

    # A single SELECT reads one consistent Postgres snapshot, so a concurrent
    # ingestion commit can't be observed as, e.g., updated tracked_seconds
    # alongside pre-update slouch_seconds (which previously produced negative
    # non_slouch_seconds/percent).
    assert_equal 1, select_count
  end

  test "empty day returns explicit zeros, not nil sums" do
    result = DailySummaryQuery.call(date: Date.current)

    assert_equal 0, result[:session_count]
    assert_equal 0, result[:tracked_seconds]
    assert_nil result[:non_slouch_percent]
  end
end
