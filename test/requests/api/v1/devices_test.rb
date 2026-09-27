require "test_helper"

class Api::V1::DevicesTest < ActionDispatch::IntegrationTest
  setup { sign_in }

  test "first registration binds a new device to the signed in account" do
    assert_difference "Device.count", 1 do
      post api_v1_devices_path, params: { device_id: VALID_DEVICE_ID }, as: :json
    end
    assert_response :ok
    assert_equal @test_user.id, Device.find(VALID_DEVICE_ID).user_id
    put_snapshot(VALID_DEVICE_ID, 7)
    assert_response :ok
    assert_equal @test_user.id, PostureSession.last.user_id
    get api_v1_today_path
    assert_equal 60, response.parsed_body.dig("summary", "tracked_seconds")
  end

  test "registration binds an empty unowned device but never claims legacy history" do
    device = Device.register(VALID_DEVICE_ID).device
    post api_v1_devices_path, params: { device_id: VALID_DEVICE_ID }, as: :json
    assert_response :ok
    assert_equal @test_user.id, device.reload.user_id

    legacy = Device.register("f" * 32).device
    legacy.posture_sessions.create!(device_session_id: 1, protocol_version: 1,
      last_sequence: 1, state: "upright", tracked_seconds: 0, slouch_seconds: 0,
      episode_count: 0, first_received_at: Time.current, last_received_at: Time.current,
      first_observed_at: Time.current, calendar_timezone: "UTC", calendar_day: Date.current)
    post api_v1_devices_path, params: { device_id: legacy.id }, as: :json
    assert_response :not_found
    assert_nil legacy.reload.user_id
    assert_nil legacy.posture_sessions.first.user_id
  end

  test "anonymous registration cannot create a device" do
    delete logout_path
    assert_no_difference "Device.count" do
      post api_v1_devices_path, params: { device_id: VALID_DEVICE_ID }, as: :json
    end
    assert_response :unauthorized
  end

  test "registering a provisioned device returns the device" do
    Device.provision!(device_id: VALID_DEVICE_ID, user: @test_user)
    post api_v1_devices_path, params: { device_id: VALID_DEVICE_ID }, as: :json

    assert_response :ok
    assert_equal({ "device" => { "device_id" => VALID_DEVICE_ID } }, response.parsed_body)
    assert Device.exists?(VALID_DEVICE_ID)
  end

  test "registering the same device again returns 200 and never erases data" do
    register_device
    post api_v1_devices_path, params: { device_id: VALID_DEVICE_ID }, as: :json

    assert_response :ok
    assert_equal 1, Device.count
  end

  test "rejects a device_id that isn't 32 lowercase hex characters" do
    post api_v1_devices_path, params: { device_id: "not-hex" }, as: :json

    assert_response :bad_request
    assert_equal "invalid_device_id", response.parsed_body.dig("error", "code")
  end

  test "rejects unknown top-level fields" do
    post api_v1_devices_path, params: { device_id: VALID_DEVICE_ID, extra: "nope" }, as: :json

    assert_response :bad_request
    assert_equal "invalid_request", response.parsed_body.dig("error", "code")
  end

  test "listing devices returns an empty array before any registration" do
    get api_v1_devices_path

    assert_response :ok
    assert_equal({ "devices" => [] }, response.parsed_body)
  end

  test "listing devices includes registered devices" do
    register_device

    get api_v1_devices_path

    assert_equal({ "devices" => [ { "device_id" => VALID_DEVICE_ID } ] }, response.parsed_body)
  end

  test "responses set Cache-Control: no-store" do
    get api_v1_devices_path

    assert_equal "no-store", response.headers["Cache-Control"]
  end
end
