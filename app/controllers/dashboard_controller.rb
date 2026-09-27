class DashboardController < ApplicationController
  skip_before_action :require_authentication, only: :show

  def show
    return render :landing unless current_user

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

  def wearable
  end

  def details
    @timezone = Rails.application.config.x.demo_timezone
    @period = %w[day week month].include?(params[:period]) ? params[:period] : "day"
    finish = Time.current.in_time_zone(@timezone).to_date
    length = { "day" => 1, "week" => 7, "month" => 30 }.fetch(@period)
    @days = (length - 1).downto(0).map do |offset|
      date = finish - offset
      [ date, DailySummaryQuery.call(date: date, sessions: current_user.posture_sessions) ]
    end
    @summary = %i[session_count episode_count tracked_seconds slouch_seconds non_slouch_seconds].index_with do |key|
      @days.sum { |_date, summary| summary.fetch(key) }
    end
  end
end
