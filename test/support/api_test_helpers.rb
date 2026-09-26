module ApiTestHelpers
  VALID_DEVICE_ID = "00112233445566778899aabbccddeeff".freeze

  def valid_snapshot(overrides = {})
    {
      protocol_version: 1,
      state: "upright",
      sequence: 12,
      tracked_seconds: 60,
      slouch_seconds: 10,
      episode_count: 2
    }.merge(overrides)
  end

  def valid_observation(overrides = {})
    { first_observed_at: 1.minute.ago.utc.iso8601 }.merge(overrides)
  end

  def snapshot_body(snapshot_overrides: {}, observation_overrides: {})
    { snapshot: valid_snapshot(snapshot_overrides), observation: valid_observation(observation_overrides) }
  end

  def sign_in(user = nil)
    @test_user = user || User.find_or_create_by!(username: "test_user") { |record| record.password = "test password long" }
    post login_path, params: { username: @test_user.username, password: "test password long" }
    @test_user
  end

  def register_device(device_id = VALID_DEVICE_ID)
    sign_in unless @test_user
    Device.provision!(device_id: device_id, user: @test_user)
    post api_v1_devices_path, params: { device_id: device_id }, as: :json
    device_id
  end

  def snapshot_path_for(device_id, device_session_id)
    "/api/v1/devices/#{device_id}/sessions/#{device_session_id}/snapshot"
  end

  def put_snapshot(device_id, device_session_id, snapshot_overrides: {}, observation_overrides: {})
    put snapshot_path_for(device_id, device_session_id),
      params: snapshot_body(snapshot_overrides: snapshot_overrides, observation_overrides: observation_overrides),
      as: :json
  end
end
