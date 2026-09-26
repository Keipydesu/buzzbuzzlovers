require "test_helper"

class PostureSnapshotTest < ActiveSupport::TestCase
  def build_session
    device = Device.register("00112233445566778899aabbccddeeff").device
    now = Time.current
    PostureSession.create!(
      device: device, device_session_id: 7, protocol_version: 1, last_sequence: 12,
      state: "upright", tracked_seconds: 60, slouch_seconds: 10, episode_count: 2,
      first_received_at: now, last_received_at: now, first_observed_at: now,
      calendar_timezone: "America/New_York", calendar_day: now.to_date
    )
  end

  def build_snapshot(overrides = {})
    now = Time.current
    PostureSnapshot.new({
      posture_session: build_session, received_at: now, protocol_version: 1,
      state: "upright", sequence: 12, tracked_seconds: 60, slouch_seconds: 10, episode_count: 2
    }.merge(overrides))
  end

  test "a valid snapshot saves" do
    assert build_snapshot.save
  end

  test "rejects slouch_seconds greater than tracked_seconds" do
    assert_not build_snapshot(slouch_seconds: 100, tracked_seconds: 10).valid?
  end

  test "rejects an unknown state" do
    assert_not build_snapshot(state: "napping").valid?
  end

  test "rejects protocol_version other than 1" do
    assert_not build_snapshot(protocol_version: 2).valid?
  end
end
