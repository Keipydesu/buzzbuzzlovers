class DashboardController < ApplicationController
  def show
    @preview = %w[activity disconnected empty].include?(params[:preview]) ? params[:preview] : "activity"
    @empty = @preview == "empty"
    # Illustrative time buckets, not reconstructed from cumulative session counters.
    @today = [
      [ "9:00", 2 ], [ "9:30", 3 ], [ "10:00", nil ],
      [ "10:30", 1 ], [ "11:00", 0 ], [ "11:30", 2 ]
    ].map { |time, count| [ time, @empty ? nil : count ] }
    @episodes = @today.sum { |_, count| count.to_i }
    @tracked_minutes = @today.count { |_, count| !count.nil? } * 30
    @slouch_minutes = @empty ? 0 : 16
    @week = [
      [ "Sun", 240, 40 ], [ "Mon", 320, 50 ], [ "Tue", 0, 0 ],
      [ "Wed", 280, 30 ], [ "Thu", 360, 40 ], [ "Fri", 220, 20 ],
      [ "Sat", @tracked_minutes, @slouch_minutes ]
    ].map { |day, tracked, slouch| [ day, @empty ? 0 : tracked, @empty ? 0 : slouch ] }
    recorded_days = @week.select { |_, tracked, _| tracked.positive? }
    @weekly_average = recorded_days.empty? ? nil : recorded_days.sum { |_, tracked, _| tracked }.fdiv(recorded_days.size)
    # Compare slouch share, not raw minutes: shorter tracking is not improvement.
    previous_days = @week[0...-1].select { |_, tracked, _| tracked.positive? }
    baseline_minutes = previous_days.sum { |_, tracked, _| tracked }
    @baseline_rate = baseline_minutes.positive? ? previous_days.sum { |_, _, slouch| slouch }.fdiv(baseline_minutes) * 100 : nil
    @today_rate = @tracked_minutes.positive? ? @slouch_minutes.fdiv(@tracked_minutes) * 100 : nil
    @reduction_target = 20
    @reduction = @baseline_rate&.positive? && @today_rate ? (1 - @today_rate / @baseline_rate) * 100 : nil
    @goal_percent = @reduction ? (@reduction / @reduction_target * 100).clamp(0, 100).round : 0
    @goal_status = @reduction.nil? ? "Building baseline" : (@reduction >= @reduction_target ? "On track" : "In progress")
  end
end
