class DashboardController < ApplicationController
  def show
    @timezone = Rails.application.config.x.demo_timezone
    today = Time.current.in_time_zone(@timezone).to_date
    @summary = DailySummaryQuery.call(date: today, sessions: current_user.posture_sessions)
    @week = 6.downto(0).map do |offset|
      date = today - offset
      [ date, DailySummaryQuery.call(date: date, sessions: current_user.posture_sessions) ]
    end
    @group = current_user.groups.order(:id).first
    @competition = WeeklyCompetitionQuery.new(group: @group).call if @group
    @entry = @competition&.entries&.find { |entry| entry.user == current_user }
  end
end
