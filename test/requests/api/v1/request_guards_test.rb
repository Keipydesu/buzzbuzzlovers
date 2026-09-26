require "test_helper"

class Api::V1::RequestGuardsTest < ActionDispatch::IntegrationTest
  setup do
    @previous_forgery_protection = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true
    get root_path
    @token = Nokogiri::HTML(response.body).at_css('meta[name="csrf-token"]')["content"]
  end

  teardown do
    ActionController::Base.allow_forgery_protection = @previous_forgery_protection
  end

  test "accepts parameterized JSON and rejects other media types" do
    post_device(body, content_type: "application/json; charset=utf-8")
    assert_response :created
    post_device(body, content_type: "text/plain")
    assert_response :unsupported_media_type
  end

  test "oversized valid and malformed JSON never reaches the decoder with CSRF enabled" do
    [ body.ljust(8193), "{".ljust(8193) ].each do |payload|
      decode_calls = 0
      with_decoder = ActiveSupport::JSON.method(:decode)
      assert_no_difference "Device.count" do
        with_method_replaced(ActiveSupport::JSON, :decode, ->(*args) { decode_calls += 1; with_decoder.call(*args) }) do
          post_device(payload)
        end
      end
      assert_equal 0, decode_calls
      assert_response :content_too_large
      assert_equal "payload_too_large", response.parsed_body.dig("error", "code")
      assert_equal "no-store", response.headers["Cache-Control"]
    end
  end

  test "8192 bytes still parse and CSRF protection remains active" do
    post_device(body.ljust(8192))
    assert_response :created
    post_device(body, token: nil)
    assert_response :forbidden
    assert_equal "no-store", response.headers["Cache-Control"]
    post_device("{")
    assert_response :bad_request
  end

  test "missing content length rejects oversized bodies before decoding" do
    env = request_env(body.ljust(8193))
    decode_calls = 0
    with_method_replaced(ActiveSupport::JSON, :decode, ->(*) { decode_calls += 1; {} }) do
      status, headers, = Middleware::ApiBodyLimit.new(Api::V1::DevicesController.action(:create)).call(env)
      assert_equal 413, status
      assert_equal "no-store", headers["cache-control"]
    end
    assert_equal 0, decode_calls
  end

  test "missing content length preserves accepted bodies for parsing" do
    ActionController::Base.allow_forgery_protection = false
    status, = Middleware::ApiBodyLimit.new(Api::V1::DevicesController.action(:create)).call(request_env(body.ljust(8192)))
    assert_equal 201, status
    assert Device.exists?(VALID_DEVICE_ID)
  end

  test "chunked bodies use a bounded read before controller dispatch" do
    env = request_env("é" * 8192)
    env["HTTP_TRANSFER_ENCODING"] = "chunked"
    stream = env.fetch("rack.input")
    original_read = stream.method(:read)
    read_lengths = []
    app = ->(*) { flunk "oversized body reached the controller" }
    with_method_replaced(stream, :read, ->(length) { read_lengths << length; original_read.call(length) }) do
      status, = Middleware::ApiBodyLimit.new(app).call(env)
      assert_equal 413, status
    end
    assert_equal [ 8193 ], read_lengths
    assert_equal 0, stream.pos
  end

  test "body middleware leaves non API requests untouched" do
    env = request_env(body)
    env["PATH_INFO"] = "/coach"
    app = ->(request_env) { assert_same env, request_env; [ 204, {}, [] ] }
    with_method_replaced(env.fetch("rack.input"), :read, ->(*) { flunk "non API body was read" }) do
      status, = Middleware::ApiBodyLimit.new(app).call(env)
      assert_equal 204, status
    end
  end

  private

  # Rack::Test normally supplies Content-Length, so use a raw controller request.
  def request_env(payload)
    env = Rack::MockRequest.env_for("/api/v1/devices", method: "POST",
      input: payload, "CONTENT_TYPE" => "application/json")
    env.delete("CONTENT_LENGTH")
    env
  end

  def body
    { device_id: VALID_DEVICE_ID }.to_json
  end

  def post_device(payload, content_type: "application/json", token: @token)
    post api_v1_devices_path, params: payload,
      headers: { "Content-Type" => content_type, "X-CSRF-Token" => token }
  end
end
