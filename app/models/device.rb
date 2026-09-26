class Device < ApplicationRecord
  self.primary_key = "id"

  DEVICE_ID_FORMAT = /\A[0-9a-f]{32}\z/

  has_many :posture_sessions, foreign_key: :device_id, inverse_of: :device

  validates :id, presence: true, format: { with: DEVICE_ID_FORMAT }
  validates :first_seen_at, :last_seen_at, presence: true

  def self.register(device_id)
    now = Time.current
    device = find_by(id: device_id)
    return device if device

    create!(id: device_id, first_seen_at: now, last_seen_at: now)
  rescue ActiveRecord::RecordNotUnique
    find_by!(id: device_id)
  end
end
