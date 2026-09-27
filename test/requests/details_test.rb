require "test_helper"

class DetailsTest < ActionDispatch::IntegrationTest
  test "periods aggregate only the current account and preserve missing days" do
    travel_to Time.zone.parse("2026-09-26 16:00:00") do
      register_device
      put_snapshot(VALID_DEVICE_ID, 1)
      assert_response :ok
      put_snapshot(VALID_DEVICE_ID, 2, observation_overrides: { first_observed_at: 3.days.ago.iso8601 })
      assert_response :ok
      put_snapshot(VALID_DEVICE_ID, 3, observation_overrides: { first_observed_at: 20.days.ago.iso8601 })
      assert_response :ok

      { "day" => 2, "week" => 4, "month" => 6 }.each do |period, episodes|
        get details_path(period: period)
        assert_response :ok
        assert_select ".period-selector a[aria-current=page]", text: period.capitalize
        assert_select ".details-totals .session-metrics > div:first-child p", text: episodes.to_s
        assert_select ".saved-week-column", count: { "day" => 0, "week" => 7, "month" => 30 }.fetch(period)
        assert_select ".weekly-data", count: 0
      end
      get details_path(period: "invalid")
      assert_response :ok
      assert_select ".period-selector a[aria-current=page]", text: "Day"

      sign_in User.create!(username: "outsider", password: "test password long")
      get details_path(period: "month")
      assert_select ".details-totals .session-metrics > div:first-child p", text: "0"
      assert_select ".saved-week-missing", count: 30
    end
  end
end
