require "test_helper"

class Api::V1::WeeklyTest < ActionDispatch::IntegrationTest
  setup { register_device }

  test "returns exactly seven oldest-to-newest days ending today, with explicit zero rows" do
    get api_v1_weekly_path

    body = response.parsed_body
    assert_equal 7, body["days"].length
    dates = body["days"].map { |day| day["date"] }
    assert_equal dates.sort, dates
    assert_equal Time.current.in_time_zone("America/New_York").to_date.iso8601, dates.last
    body["days"].each do |day|
      assert_equal 0, day["summary"]["session_count"]
      assert_nil day["summary"]["non_slouch_percent"]
    end
  end

  test "today's activity appears only in today's row" do
    put_snapshot(VALID_DEVICE_ID, 1, snapshot_overrides: { sequence: 1, tracked_seconds: 60, slouch_seconds: 10 })

    get api_v1_weekly_path

    days = response.parsed_body["days"]
    assert_equal 60, days.last["summary"]["tracked_seconds"]
    days[0..-2].each { |day| assert_equal 0, day["summary"]["tracked_seconds"] }
  end
end
