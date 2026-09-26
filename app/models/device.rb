class Device < ApplicationRecord
  self.primary_key = "id"

  DEVICE_ID_FORMAT = /\A[0-9a-f]{32}\z/

  has_many :posture_sessions, foreign_key: :device_id, inverse_of: :device

  validates :id, presence: true, format: { with: DEVICE_ID_FORMAT }
  validates :first_seen_at, :last_seen_at, presence: true

  Registration = Struct.new(:device, :created, keyword_init: true) do
    def created? = created
  end

  # Returns whether *this* call created the row, not merely whether it now
  # exists — a concurrent registration can also observe no existing device
  # and lose the unique-constraint race, in which case it must report the
  # documented 200 (existing), not 201 (created).
  def self.register(device_id)
    now = Time.current
    existing = find_existing(device_id)
    return Registration.new(device: existing, created: false) if existing

    # requires_new: true opens a savepoint rather than joining any transaction
    # already open on this connection (test transactional fixtures, a future
    # caller). Without it, a unique-constraint failure here aborts the whole
    # enclosing transaction, and the rescue's find_by! below fails too.
    transaction(requires_new: true) do
      Registration.new(device: create!(id: device_id, first_seen_at: now, last_seen_at: now), created: true)
    end
  rescue ActiveRecord::RecordNotUnique
    Registration.new(device: find_by!(id: device_id), created: false)
  end

  # Separated from register's own find_by! call so a test can force the
  # existence check to miss a row without touching find_by!, which Rails
  # implements as find_by(*args) || ... internally.
  def self.find_existing(device_id)
    find_by(id: device_id)
  end
end
