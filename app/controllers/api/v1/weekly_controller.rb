module Api
  module V1
    class WeeklyController < BaseController
      def show
        today = Time.current.in_time_zone(demo_timezone).to_date
        days = 6.downto(0).map { |offset| today - offset }

        render json: {
          timezone: demo_timezone,
          grouping: "first_observed_date",
          days: days.map { |date| { date: date.iso8601, summary: DailySummaryQuery.call(date: date, sessions: current_user.posture_sessions) } }
        }
      end
    end
  end
end
