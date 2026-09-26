require "test_helper"

class Api::V1::DevicesTest < ActionDispatch::IntegrationTest
  test "registering a new device returns 201 and the device" do
    post api_v1_devices_path, params: { device_id: VALID_DEVICE_ID }, as: :json

    assert_response :created
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
