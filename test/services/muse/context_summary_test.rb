require "test_helper"

class Muse::ContextSummaryTest < ActiveSupport::TestCase
  setup do
    travel_to Time.utc(2026, 9, 27, 16)
    @user = User.create!(username: "analysis_user", password: "a" * 12)
    @device = Device.provision!(device_id: "a" * 32, user: @user)
  end
  teardown { travel_back }

  test "no recorded time has no ratio and does not mean no slouching" do
    summary = Muse::ContextSummary.call(@user, analysis: true)
    assert_includes summary, "0 of 7"
    assert_includes summary, "not enough recorded data"
    assert_not_includes summary, "%"
  end

  test "weighted ratio and coverage exclude empty days and other accounts" do
    session(@device, 1, 0, 600, 300)
    session(@device, 2, 1, 5400, 0)
    session(@device, 3, 2, 0, 0)
    other = User.create!(username: "analysis_other", password: "b" * 12)
    session(Device.provision!(device_id: "b" * 32, user: other), 1, 0, 12000, 12000)
    summary = Muse::ContextSummary.call(@user, analysis: true)
    assert_includes summary, "5.0%"
    assert_includes summary, "2 of 7"
    assert_includes summary, "100.0 min tracked"
    assert_not_includes summary, "200.0 min"
    assert_includes summary, "first-seen date"
    assert_includes summary, "hour-of-day"
    assert_includes summary, "not unique personal elapsed time"
  end

  test "one recorded day does not establish a repeated pattern" do
    session(@device, 1, 0, 60, 0)
    summary = Muse::ContextSummary.call(@user, analysis: true)
    assert_includes summary, "1 of 7"
    assert_includes summary, "0.0%"
    assert_includes summary, "does not establish consistency"
  end

  private

  def session(device, id, days_ago, tracked, slouch)
    now = Time.current - days_ago.days
    PostureSession.create!(device: device, device_session_id: id, last_sequence: 1,
      state: "upright", tracked_seconds: tracked, slouch_seconds: slouch, episode_count: 0,
      first_received_at: now, last_received_at: now, first_observed_at: now,
      calendar_timezone: "America/New_York", calendar_day: now.in_time_zone("America/New_York").to_date)
  end
end
