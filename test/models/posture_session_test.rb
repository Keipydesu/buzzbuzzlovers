require "test_helper"

class PostureSessionTest < ActiveSupport::TestCase
  def build_session(overrides = {})
    device = Device.register("00112233445566778899aabbccddeeff").device
    now = Time.current

    PostureSession.new({
      device: device,
      device_session_id: 7,
      protocol_version: 1,
      last_sequence: 12,
      state: "upright",
      tracked_seconds: 60,
      slouch_seconds: 10,
      episode_count: 2,
      ended: false,
      first_received_at: now,
      last_received_at: now,
      first_observed_at: now,
      calendar_timezone: "America/New_York",
      calendar_day: now.to_date
    }.merge(overrides))
  end

  test "a valid session saves" do
    assert build_session.save
  end

  test "rejects slouch_seconds greater than tracked_seconds" do
    session = build_session(slouch_seconds: 100, tracked_seconds: 10)

    assert_not session.valid?
    assert_includes session.errors[:slouch_seconds], "must not exceed tracked_seconds"
  end

  test "rejects an unknown state" do
    assert_not build_session(state: "napping").valid?
  end

  test "rejects a device_session_id of zero" do
    assert_not build_session(device_session_id: 0).valid?
  end

  test "non_slouch_seconds subtracts slouch from tracked" do
    assert_equal 50, build_session.non_slouch_seconds
  end

  test "matches_canonical? compares only the six canonical fields" do
    session = build_session
    session.save!

    assert session.matches_canonical?(
      protocol_version: 1, state: "upright", last_sequence: 12,
      tracked_seconds: 60, slouch_seconds: 10, episode_count: 2
    )
    assert_not session.matches_canonical?(
      protocol_version: 1, state: "upright", last_sequence: 12,
      tracked_seconds: 61, slouch_seconds: 10, episode_count: 2
    )
  end
end
