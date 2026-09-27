class CreateDemoSessions < ActiveRecord::Migration[8.1]
  def change
    create_table :demo_sessions, id: false do |t|
      t.integer :id, primary_key: true
      t.integer :protocol_version, null: false
      t.string :state, null: false
      t.integer :sequence, null: false
      t.integer :tracked_seconds, null: false
      t.integer :slouch_seconds, null: false
      t.integer :episode_count, null: false
      t.datetime :first_observed_at, null: false
      t.date :calendar_day, null: false
      t.string :calendar_timezone, null: false
      t.timestamps
    end
    add_check_constraint :demo_sessions, "slouch_seconds >= 0 AND slouch_seconds <= tracked_seconds AND tracked_seconds <= 4294967295", name: "valid_durations"
    add_check_constraint :demo_sessions, "episode_count BETWEEN 0 AND 65535 AND sequence BETWEEN 1 AND 4294967295 AND id BETWEEN 1 AND 4294967295", name: "valid_counters"
    add_check_constraint :demo_sessions, "protocol_version = 1 AND state IN ('idle','calibrating','upright','slouching','sensor_error','ended')", name: "valid_protocol"
  end
end
