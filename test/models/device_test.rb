require "test_helper"

class DeviceTest < ActiveSupport::TestCase
  DEVICE_ID = "00112233445566778899aabbccddeeff"

  test "register creates a device on first call" do
    registration = Device.register(DEVICE_ID)

    assert registration.created?
    assert_equal DEVICE_ID, registration.device.id
    assert_equal 1, Device.count
  end

  test "register is idempotent, reports created only on the first call, and never erases data" do
    first = Device.register(DEVICE_ID)
    second = Device.register(DEVICE_ID)

    assert first.created?
    assert_not second.created?
    assert_equal first.device.first_seen_at.to_i, second.device.first_seen_at.to_i
    assert_equal 1, Device.count
  end

  test "a losing concurrent registration reports created: false, not the winner's 201" do
    # Simulate the race from the PR review: another request's create! commits
    # between this request's existence check and its own create! attempt, by
    # forcing the existence check to miss the row that's actually already there.
    Device.create!(id: DEVICE_ID, first_seen_at: Time.current, last_seen_at: Time.current)

    original_find_existing = Device.method(:find_existing)
    Device.define_singleton_method(:find_existing) { |*| nil }
    begin
      registration = Device.register(DEVICE_ID)
    ensure
      Device.define_singleton_method(:find_existing, &original_find_existing)
    end

    assert_not registration.created?
    assert_equal DEVICE_ID, registration.device.id
    assert_equal 1, Device.count
  end

  test "rejects a device_id that isn't 32 lowercase hex characters" do
    device = Device.new(id: "not-hex", first_seen_at: Time.current, last_seen_at: Time.current)

    assert_not device.valid?
  end
end
