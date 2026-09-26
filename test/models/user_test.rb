require "test_helper"

class UserTest < ActiveSupport::TestCase
  test "rejects duplicate normalized names, short and overlong passwords" do
    User.create!(username: "Alice", password: "test password long")
    assert_not User.new(username: " ALICE ", password: "test password long").valid?
    assert_not User.new(username: "bob", password: "short").valid?
    assert_not User.new(username: "bob", password: "a" * 73).valid?
  end

  test "provisioning cannot transfer a device or claim legacy history" do
    alice = User.create!(username: "alice", password: "test password long")
    bob = User.create!(username: "bob", password: "test password long")
    device = Device.provision!(device_id: "a" * 32, user: alice)
    assert_equal device, Device.provision!(device_id: device.id, user: alice)
    assert_raises(ArgumentError) { Device.provision!(device_id: device.id, user: bob) }
    assert_not device.update(user: bob)
    assert_equal alice.id, device.reload.user_id

    legacy = Device.register("b" * 32).device
    Snapshots::Ingest.new(device: legacy, device_session_id: 1,
      snapshot: { protocol_version: 1, state: "upright", sequence: 1, tracked_seconds: 60, slouch_seconds: 10, episode_count: 1 },
      first_observed_at: Time.current, calendar_timezone: "America/New_York").call
    assert_raises(ArgumentError) { Device.provision!(device_id: legacy.id, user: alice) }
    assert_nil legacy.reload.user_id
    assert_nil legacy.posture_sessions.first.user_id
  end
end
