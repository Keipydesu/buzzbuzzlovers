require "test_helper"

class Api::V1::SessionsTest < ActionDispatch::IntegrationTest
  setup { register_device }

  test "returns null before any session exists" do
    get api_v1_device_session_path(device_id: VALID_DEVICE_ID)

    assert_response :ok
    assert_equal({ "session" => nil }, response.parsed_body)
  end

  test "returns the session with the greatest device_session_id, not the most recently received" do
    put_snapshot(VALID_DEVICE_ID, 5, snapshot_overrides: { sequence: 1 })
    put_snapshot(VALID_DEVICE_ID, 9, snapshot_overrides: { sequence: 1 })
    # An old session arriving late must not become "current".
    put_snapshot(VALID_DEVICE_ID, 5, snapshot_overrides: { sequence: 2, tracked_seconds: 70 })

    get api_v1_device_session_path(device_id: VALID_DEVICE_ID)

    assert_equal 9, response.parsed_body["session"]["device_session_id"]
  end

  test "an unregistered device returns 404" do
    get api_v1_device_session_path(device_id: "ffffffffffffffffffffffffffffffff")

    assert_response :not_found
  end
end
