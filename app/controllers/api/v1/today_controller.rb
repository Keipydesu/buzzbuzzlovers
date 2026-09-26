module Api
  module V1
    class TodayController < BaseController
      def show
        date = Time.current.in_time_zone(demo_timezone).to_date
        summary = DailySummaryQuery.call(date: date)

        render json: {
          date: date.iso8601,
          timezone: demo_timezone,
          grouping: "first_observed_date",
          summary: summary,
          challenge: ChallengeQuery.call(summary[:tracked_seconds])
        }
      end
    end
  end
end
