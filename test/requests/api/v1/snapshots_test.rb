require "test_helper"

class Api::V1::SnapshotsTest < ActionDispatch::IntegrationTest
  setup { register_device }

  test "first snapshot for a session is accepted and freezes observation metadata" do
    observed_at = 2.minutes.ago.utc.iso8601
    put_snapshot(VALID_DEVICE_ID, 7, observation_overrides: { first_observed_at: observed_at })

    assert_response :ok
    body = response.parsed_body
    assert_equal "accepted", body["disposition"]
    assert_equal 7, body["session"]["device_session_id"]
    assert_equal 12, body["session"]["snapshot"]["sequence"]
    assert_equal observed_at, body["session"]["first_observed_at"]

    session = PostureSession.find_by!(device_id: VALID_DEVICE_ID, device_session_id: 7)
    assert_equal Time.iso8601(observed_at).in_time_zone("America/New_York").to_date, session.calendar_day
  end

  test "an unregistered device returns 404 and never creates a session" do
    put_snapshot("ffffffffffffffffffffffffffffffff", 1)

    assert_response :not_found
    assert_equal "device_not_found", response.parsed_body.dig("error", "code")
    assert_equal 0, PostureSession.count
  end

  test "session 0 is rejected as never-persisted activity" do
    put_snapshot(VALID_DEVICE_ID, 0)

    assert_response :bad_request
    assert_equal 0, PostureSession.count
  end

  test "a lower sequence retry is a no-op stale disposition" do
    put_snapshot(VALID_DEVICE_ID, 7, snapshot_overrides: { sequence: 12 })
    put_snapshot(VALID_DEVICE_ID, 7, snapshot_overrides: { sequence: 5, tracked_seconds: 1, slouch_seconds: 0 })

    assert_response :ok
    assert_equal "stale", response.parsed_body["disposition"]
    session = PostureSession.find_by!(device_id: VALID_DEVICE_ID, device_session_id: 7)
    assert_equal 12, session.last_sequence
    assert_equal 60, session.tracked_seconds
  end

  test "an identical equal-sequence retry is a harmless duplicate" do
    put_snapshot(VALID_DEVICE_ID, 7)
    put_snapshot(VALID_DEVICE_ID, 7)

    assert_response :ok
    assert_equal "duplicate", response.parsed_body["disposition"]
  end

  test "an equal-sequence retry with different values is a rejected conflict" do
    put_snapshot(VALID_DEVICE_ID, 7)
    put_snapshot(VALID_DEVICE_ID, 7, snapshot_overrides: { tracked_seconds: 999 })

    assert_response :conflict
    assert_equal "snapshot_conflict", response.parsed_body.dig("error", "code")
    session = PostureSession.find_by!(device_id: VALID_DEVICE_ID, device_session_id: 7)
    assert_equal 60, session.tracked_seconds
  end

  test "a higher sequence with a regressing counter is rejected without mutation" do
    put_snapshot(VALID_DEVICE_ID, 7, snapshot_overrides: { sequence: 12, tracked_seconds: 60, slouch_seconds: 10 })
    put_snapshot(VALID_DEVICE_ID, 7, snapshot_overrides: { sequence: 13, tracked_seconds: 30, slouch_seconds: 5 })

    assert_response :unprocessable_entity
    assert_equal "counter_regression", response.parsed_body.dig("error", "code")
    session = PostureSession.find_by!(device_id: VALID_DEVICE_ID, device_session_id: 7)
    assert_equal 12, session.last_sequence
    assert_equal 60, session.tracked_seconds
  end

  test "a higher sequence with nondecreasing counters is accepted" do
    put_snapshot(VALID_DEVICE_ID, 7, snapshot_overrides: { sequence: 12, tracked_seconds: 60, slouch_seconds: 10 })
    put_snapshot(VALID_DEVICE_ID, 7, snapshot_overrides: { sequence: 13, tracked_seconds: 90, slouch_seconds: 20 })

    assert_response :ok
    assert_equal "accepted", response.parsed_body["disposition"]
    session = PostureSession.find_by!(device_id: VALID_DEVICE_ID, device_session_id: 7)
    assert_equal 13, session.last_sequence
    assert_equal 90, session.tracked_seconds
  end

  test "ending a session sets ended, and an identical retry is still a duplicate" do
    put_snapshot(VALID_DEVICE_ID, 7, snapshot_overrides: { sequence: 12, state: "ended" })
    assert PostureSession.find_by!(device_id: VALID_DEVICE_ID, device_session_id: 7).ended?

    put_snapshot(VALID_DEVICE_ID, 7, snapshot_overrides: { sequence: 12, state: "ended" })
    assert_response :ok
    assert_equal "duplicate", response.parsed_body["disposition"]
  end

  test "a higher sequence cannot reopen an ended session" do
    put_snapshot(VALID_DEVICE_ID, 7, snapshot_overrides: { sequence: 12, state: "ended" })
    put_snapshot(VALID_DEVICE_ID, 7, snapshot_overrides: { sequence: 13, state: "upright" })

    assert_response :conflict
    assert_equal "session_ended", response.parsed_body.dig("error", "code")
    assert PostureSession.find_by!(device_id: VALID_DEVICE_ID, device_session_id: 7).ended?
  end

  test "rejects floats, numeric strings, booleans, and nulls for integer fields" do
    [ 1.0, "12", true, nil ].each do |bad_value|
      put_snapshot(VALID_DEVICE_ID, 7, snapshot_overrides: { sequence: bad_value })
      assert_response :unprocessable_entity, "expected #{bad_value.inspect} to be rejected"
      assert_equal "invalid_snapshot", response.parsed_body.dig("error", "code")
    end
  end

  test "rejects slouch_seconds greater than tracked_seconds" do
    put_snapshot(VALID_DEVICE_ID, 7, snapshot_overrides: { tracked_seconds: 10, slouch_seconds: 20 })

    assert_response :unprocessable_entity
    assert_equal "invalid_snapshot", response.parsed_body.dig("error", "code")
  end

  test "rejects an unknown state" do
    put_snapshot(VALID_DEVICE_ID, 7, snapshot_overrides: { state: "napping" })

    assert_response :unprocessable_entity
    assert_equal "invalid_snapshot", response.parsed_body.dig("error", "code")
  end

  test "rejects a first_observed_at more than five minutes in the future" do
    put_snapshot(VALID_DEVICE_ID, 7, observation_overrides: { first_observed_at: 10.minutes.from_now.utc.iso8601 })

    assert_response :unprocessable_entity
    assert_equal "invalid_observation", response.parsed_body.dig("error", "code")
  end

  test "rejects a protocol_version of 1.0 despite Ruby's 1.0 == 1" do
    put snapshot_path_for(VALID_DEVICE_ID, 7),
      params: { snapshot: valid_snapshot.merge(protocol_version: 1.0), observation: valid_observation }, as: :json

    assert_response :unprocessable_entity
    assert_equal "invalid_snapshot", response.parsed_body.dig("error", "code")
  end

  test "rejects first_observed_at without an explicit offset, even though Time.iso8601 would accept it" do
    put snapshot_path_for(VALID_DEVICE_ID, 7),
      params: { snapshot: valid_snapshot, observation: { first_observed_at: "2026-09-25T23:30:00" } }, as: :json

    assert_response :unprocessable_entity
    assert_equal "invalid_observation", response.parsed_body.dig("error", "code")
  end

  test "accepts first_observed_at with a Z offset and with a numeric offset" do
    put_snapshot(VALID_DEVICE_ID, 7, observation_overrides: { first_observed_at: "2026-09-25T23:30:00Z" })
    assert_response :ok

    put_snapshot(VALID_DEVICE_ID, 8, snapshot_overrides: { sequence: 1 },
      observation_overrides: { first_observed_at: "2026-09-25T19:30:00-04:00" })
    assert_response :ok
  end

  test "rejects unknown fields in the snapshot object" do
    put snapshot_path_for(VALID_DEVICE_ID, 7),
      params: { snapshot: valid_snapshot.merge(extra: 1), observation: valid_observation }, as: :json

    assert_response :unprocessable_entity
    assert_equal "invalid_snapshot", response.parsed_body.dig("error", "code")
  end

  test "rejects a wrong content type" do
    put snapshot_path_for(VALID_DEVICE_ID, 7),
      params: snapshot_body.to_json, headers: { "Content-Type" => "text/plain" }

    assert_response :unsupported_media_type
  end
end
