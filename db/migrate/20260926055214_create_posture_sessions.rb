class CreatePostureSessions < ActiveRecord::Migration[8.1]
  STATES = %w[idle calibrating upright slouching sensor_error ended].freeze
  UINT32_MAX = 4_294_967_295
  UINT16_MAX = 65_535

  def change
    create_table :posture_sessions do |t|
      t.references :device, null: false, foreign_key: true, type: :string, limit: 32
      t.bigint :device_session_id, null: false
      t.integer :protocol_version, null: false, default: 1
      t.bigint :last_sequence, null: false
      t.string :state, null: false
      t.bigint :tracked_seconds, null: false, default: 0
      t.bigint :slouch_seconds, null: false, default: 0
      t.integer :episode_count, null: false, default: 0
      t.boolean :ended, null: false, default: false
      t.datetime :first_received_at, null: false
      t.datetime :last_received_at, null: false
      t.datetime :first_observed_at, null: false
      t.string :calendar_timezone, null: false
      t.date :calendar_day, null: false

      t.timestamps
    end

    add_index :posture_sessions, [ :device_id, :device_session_id ], unique: true,
      name: "index_posture_sessions_on_device_id_and_device_session_id"

    add_check_constraint :posture_sessions,
      "device_session_id BETWEEN 1 AND #{UINT32_MAX}",
      name: "posture_sessions_device_session_id_range"
    add_check_constraint :posture_sessions,
      "last_sequence BETWEEN 1 AND #{UINT32_MAX}",
      name: "posture_sessions_last_sequence_range"
    add_check_constraint :posture_sessions,
      "protocol_version = 1",
      name: "posture_sessions_protocol_version_is_one"
    add_check_constraint :posture_sessions,
      "state IN (#{STATES.map { |s| "'#{s}'" }.join(", ")})",
      name: "posture_sessions_state_is_known"
    add_check_constraint :posture_sessions,
      "tracked_seconds BETWEEN 0 AND #{UINT32_MAX}",
      name: "posture_sessions_tracked_seconds_range"
    add_check_constraint :posture_sessions,
      "slouch_seconds BETWEEN 0 AND #{UINT32_MAX}",
      name: "posture_sessions_slouch_seconds_range"
    add_check_constraint :posture_sessions,
      "slouch_seconds <= tracked_seconds",
      name: "posture_sessions_slouch_within_tracked"
    add_check_constraint :posture_sessions,
      "episode_count BETWEEN 0 AND #{UINT16_MAX}",
      name: "posture_sessions_episode_count_range"
    add_check_constraint :posture_sessions,
      "ended = (state = 'ended')",
      name: "posture_sessions_ended_matches_state"
  end
end
