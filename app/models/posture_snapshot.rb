# Accepted-revision history, per docs/data-storage.md. Append-only: rows are
# created once by Snapshots::Ingest on an accepted disposition and never
# updated or deleted by the app. posture_sessions remains the reconciliation
# authority — never sum these cumulative fields across rows (revisions 60 and
# 90 tracked_seconds mean 90 total, not 150); use PostureSession/DailySummaryQuery
# for all daily/weekly totals instead.
class PostureSnapshot < ApplicationRecord
  self.primary_key = [ :received_at, :posture_session_id, :sequence ]

  belongs_to :posture_session, inverse_of: :posture_snapshots

  validates :received_at, presence: true
  validates :protocol_version, inclusion: { in: [ 1 ] }
  validates :state, inclusion: { in: PostureSession::STATES }
  validates :sequence, numericality: {
    only_integer: true, greater_than_or_equal_to: 1, less_than_or_equal_to: PostureSession::UINT32_MAX
  }
  validates :tracked_seconds, numericality: {
    only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: PostureSession::UINT32_MAX
  }
  validates :slouch_seconds, numericality: {
    only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: PostureSession::UINT32_MAX
  }
  validates :episode_count, numericality: {
    only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: PostureSession::UINT16_MAX
  }
  validate :slouch_within_tracked

  private

  def slouch_within_tracked
    return if slouch_seconds.nil? || tracked_seconds.nil? || slouch_seconds <= tracked_seconds

    errors.add(:slouch_seconds, "must not exceed tracked_seconds")
  end
end
