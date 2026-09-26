require "test_helper"

class Api::V1::TodayTest < ActionDispatch::IntegrationTest
  setup { register_device }

  test "empty shape before any activity today" do
    get api_v1_today_path

    assert_response :ok
    body = response.parsed_body
    assert_equal({
      "session_count" => 0,
      "incomplete_session_count" => 0,
      "tracked_seconds" => 0,
      "slouch_seconds" => 0,
      "non_slouch_seconds" => 0,
      "episode_count" => 0,
      "non_slouch_percent" => nil
    }, body["summary"])
    assert_equal 0, body["challenge"]["progress_seconds"]
    assert_not body["challenge"]["completed"]
  end

  test "sums two sessions once per session, not the mean of their percentages" do
    now = Time.current.iso8601
    put_snapshot(VALID_DEVICE_ID, 1,
      snapshot_overrides: { sequence: 1, tracked_seconds: 60, slouch_seconds: 10 },
      observation_overrides: { first_observed_at: now })
    put_snapshot(VALID_DEVICE_ID, 2,
      snapshot_overrides: { sequence: 1, tracked_seconds: 120, slouch_seconds: 60 },
      observation_overrides: { first_observed_at: now })

    get api_v1_today_path

    summary = response.parsed_body["summary"]
    assert_equal 2, summary["session_count"]
    assert_equal 180, summary["tracked_seconds"]
    assert_equal 70, summary["slouch_seconds"]
    assert_equal 110, summary["non_slouch_seconds"]
    assert_equal 61.11, summary["non_slouch_percent"]
  end

  test "challenge completes at 1200 tracked seconds and caps progress" do
    put_snapshot(VALID_DEVICE_ID, 1, snapshot_overrides: { sequence: 1, tracked_seconds: 1500, slouch_seconds: 0 })

    get api_v1_today_path

    challenge = response.parsed_body["challenge"]
    assert_equal 1200, challenge["progress_seconds"]
    assert challenge["completed"]
    assert_equal 50, challenge["earned_points"]
  end

  test "an incomplete (never-ended) session is counted and labeled incomplete" do
    put_snapshot(VALID_DEVICE_ID, 1, snapshot_overrides: { sequence: 1, state: "slouching" })

    get api_v1_today_path

    summary = response.parsed_body["summary"]
    assert_equal 1, summary["session_count"]
    assert_equal 1, summary["incomplete_session_count"]
  end
end
