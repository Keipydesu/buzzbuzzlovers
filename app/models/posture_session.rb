class PostureSession < ApplicationRecord
  belongs_to :user, optional: true
  attr_readonly :user_id
  before_validation :assign_owner, on: :create
  validate :owner_matches_device

  belongs_to :device, inverse_of: :posture_sessions
  has_many :posture_snapshots, inverse_of: :posture_session

  STATES = %w[idle calibrating upright slouching sensor_error ended].freeze
  UINT32_MAX = 4_294_967_295
  UINT16_MAX = 65_535

  # The six fields app-api.md calls "canonical": these are what an equal-sequence
  # duplicate/conflict comparison checks, excluding transport/observation metadata.
  CANONICAL_ATTRIBUTES = %i[protocol_version state last_sequence tracked_seconds slouch_seconds episode_count].freeze

  validates :device_session_id, presence: true,
    numericality: { only_integer: true, greater_than_or_equal_to: 1, less_than_or_equal_to: UINT32_MAX }
  validates :protocol_version, inclusion: { in: [ 1 ] }
  validates :last_sequence, presence: true,
    numericality: { only_integer: true, greater_than_or_equal_to: 1, less_than_or_equal_to: UINT32_MAX }
  validates :state, inclusion: { in: STATES }
  validates :tracked_seconds, numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: UINT32_MAX }
  validates :slouch_seconds, numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: UINT32_MAX }
  validates :episode_count, numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: UINT16_MAX }
  validate :slouch_within_tracked
  validates :first_received_at, :last_received_at, :first_observed_at, :calendar_timezone, :calendar_day, presence: true

  scope :on_calendar_day, ->(date) { where(calendar_day: date) }

  def non_slouch_seconds
    tracked_seconds - slouch_seconds
  end

  def canonical_attributes
    CANONICAL_ATTRIBUTES.index_with { |attr| public_send(attr) }
  end

  def matches_canonical?(other_attributes)
    canonical_attributes == other_attributes.symbolize_keys.slice(*CANONICAL_ATTRIBUTES)
  end

  private

  def assign_owner
    self.user_id = device&.user_id
  end

  def owner_matches_device
    errors.add(:user_id, "must match device owner") unless user_id == device&.user_id
  end

  def slouch_within_tracked
    return if slouch_seconds.nil? || tracked_seconds.nil?
    return if slouch_seconds <= tracked_seconds

    errors.add(:slouch_seconds, "must not exceed tracked_seconds")
  end
end
