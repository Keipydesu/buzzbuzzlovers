# Daily challenge proposal from docs/APP_PLAN.md: track 20 minutes for 50 points,
# derived from stored totals (never incremented on upload) so repeated uploads
# cannot grant extra points. Product mechanic, not yet confirmed (MVP.md open decision 7).
class ChallengeQuery
  ID = "track_20_minutes".freeze
  TARGET_SECONDS = 1200
  POINTS = 50

  def self.call(tracked_seconds)
    progress_seconds = [ tracked_seconds, TARGET_SECONDS ].min
    completed = tracked_seconds >= TARGET_SECONDS

    {
      id: ID,
      target_seconds: TARGET_SECONDS,
      progress_seconds: progress_seconds,
      completed: completed,
      earned_points: completed ? POINTS : 0
    }
  end
end
