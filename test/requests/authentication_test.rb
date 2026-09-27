require "test_helper"

class AuthenticationTest < ActionDispatch::IntegrationTest
  test "signup normalizes username, hashes password, logs in and logout revokes access" do
    post signup_path, params: { user: { username: " Alice ", password: "test password long", password_confirmation: "test password long" } }
    assert_redirected_to root_path
    user = User.find_by!(username: "alice")
    assert user.authenticate("test password long")
    assert_not_equal "test password long", user.password_digest
    get api_v1_devices_path
    assert_response :ok
    delete logout_path
    get api_v1_devices_path
    assert_response :unauthorized
  end

  test "login failure is generic and usernames are case insensitive" do
    user = User.create!(username: "alice", password: "test password long")
    post login_path, params: { username: "ALICE", password: "wrong" }
    assert_response :unprocessable_entity
    assert_includes response.body, "Username or password is incorrect"
    get api_v1_devices_path
    assert_response :unauthorized
    post login_path, params: { username: " ALICE ", password: "test password long" }
    assert_redirected_to root_path
    assert_equal user.id, session[:user_id]
  end

  test "anonymous API reads and uploads are denied and other browser pages require login" do
    get root_path
    assert_response :ok
    assert_select "h1", text: "Notice your posture. Build better habits, together."
    assert_select "a[href=?]", signup_path, minimum: 1
    assert_select "a[href=?]", login_path, minimum: 1
    assert_select "form", count: 0
    get groups_path
    assert_redirected_to login_path
    get wearable_path
    assert_redirected_to login_path
    get coach_path
    assert_redirected_to login_path
    [ api_v1_devices_path, api_v1_today_path, api_v1_weekly_path ].each do |path|
      get path
      assert_response :unauthorized
      assert_equal "no-store", response.headers["Cache-Control"]
    end
    put_snapshot(VALID_DEVICE_ID, 7)
    assert_response :unauthorized
  end

  test "signed in root shows saved dashboard and logout restores public introduction" do
    sign_in
    get root_path
    assert_response :ok
    assert_select "h2", text: "Today"
    assert_select ".landing-page", count: 0
    assert_equal "no-store", response.headers["Cache-Control"]
    delete logout_path
    get root_path
    assert_response :ok
    assert_select ".landing-page", count: 1
    assert_select "#today", count: 0
  end

  test "other users cannot see or mutate device sessions or summary totals" do
    register_device
    put_snapshot(VALID_DEVICE_ID, 7)
    assert_response :ok
    owner = @test_user
    other = User.create!(username: "other", password: "test password long")
    sign_in(other)
    get api_v1_devices_path
    assert_empty response.parsed_body["devices"]
    get "/api/v1/devices/#{VALID_DEVICE_ID}/session"
    assert_response :not_found
    assert_no_changes -> { PostureSession.first.reload.attributes } do
      put_snapshot(VALID_DEVICE_ID, 7, snapshot_overrides: { sequence: 13, tracked_seconds: 100 })
      assert_response :not_found
    end
    post api_v1_devices_path, params: { device_id: VALID_DEVICE_ID }, as: :json
    assert_response :not_found
    get api_v1_today_path
    assert_equal 0, response.parsed_body.dig("summary", "tracked_seconds")
    get api_v1_weekly_path
    assert response.parsed_body["days"].all? { |day| day.dig("summary", "tracked_seconds").zero? }
    assert_equal owner.id, PostureSession.first.user_id
  end

  test "login attempts are rate limited" do
    cache = ActiveSupport::Cache::MemoryStore.new
    with_method_replaced(Rails.cache, :increment, ->(*args, **options) { cache.increment(*args, **options) }) do
      10.times { post login_path, params: { username: "missing", password: "wrong" } }
      assert_response :unprocessable_entity
      post login_path, params: { username: "missing", password: "wrong" }
      assert_response :too_many_requests
    end
  end

  test "signup and login enforce CSRF" do
    previous = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true
    assert_no_difference "User.count" do
      post signup_path, params: { user: { username: "alice", password: "test password long" } }
      assert_response :unprocessable_entity
    end
    post login_path, params: { username: "alice", password: "test password long" }
    assert_response :unprocessable_entity
  ensure
    ActionController::Base.allow_forgery_protection = previous
  end
end
