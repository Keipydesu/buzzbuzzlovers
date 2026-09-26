require "test_helper"

class DeviceTest < ActiveSupport::TestCase
  DEVICE_ID = "00112233445566778899aabbccddeeff"

  test "register creates a device on first call" do
    device = Device.register(DEVICE_ID)

    assert_equal DEVICE_ID, device.id
    assert_equal 1, Device.count
  end

  test "register is idempotent and never erases data" do
    first = Device.register(DEVICE_ID)
    second = Device.register(DEVICE_ID)

    assert_equal first.first_seen_at.to_i, second.first_seen_at.to_i
    assert_equal 1, Device.count
  end

  test "rejects a device_id that isn't 32 lowercase hex characters" do
    device = Device.new(id: "not-hex", first_seen_at: Time.current, last_seen_at: Time.current)

    assert_not device.valid?
  end
end
