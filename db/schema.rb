# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_09_26_055214) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "devices", id: { type: :string, limit: 32 }, force: :cascade do |t|
    t.datetime "first_seen_at", null: false
    t.datetime "last_seen_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.check_constraint "id::text ~ '^[0-9a-f]{32}$'::text", name: "devices_id_is_lowercase_hex32"
  end

  create_table "posture_sessions", force: :cascade do |t|
    t.string "device_id", limit: 32, null: false
    t.bigint "device_session_id", null: false
    t.integer "protocol_version", default: 1, null: false
    t.bigint "last_sequence", null: false
    t.string "state", null: false
    t.bigint "tracked_seconds", default: 0, null: false
    t.bigint "slouch_seconds", default: 0, null: false
    t.integer "episode_count", default: 0, null: false
    t.boolean "ended", default: false, null: false
    t.datetime "first_received_at", null: false
    t.datetime "last_received_at", null: false
    t.datetime "first_observed_at", null: false
    t.string "calendar_timezone", null: false
    t.date "calendar_day", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["device_id", "device_session_id"], name: "index_posture_sessions_on_device_id_and_device_session_id", unique: true
    t.index ["device_id"], name: "index_posture_sessions_on_device_id"
    t.check_constraint "device_session_id >= 1 AND device_session_id <= '4294967295'::bigint", name: "posture_sessions_device_session_id_range"
    t.check_constraint "ended = (state::text = 'ended'::text)", name: "posture_sessions_ended_matches_state"
    t.check_constraint "episode_count >= 0 AND episode_count <= 65535", name: "posture_sessions_episode_count_range"
    t.check_constraint "last_sequence >= 1 AND last_sequence <= '4294967295'::bigint", name: "posture_sessions_last_sequence_range"
    t.check_constraint "protocol_version = 1", name: "posture_sessions_protocol_version_is_one"
    t.check_constraint "slouch_seconds <= tracked_seconds", name: "posture_sessions_slouch_within_tracked"
    t.check_constraint "slouch_seconds >= 0 AND slouch_seconds <= '4294967295'::bigint", name: "posture_sessions_slouch_seconds_range"
    t.check_constraint "state::text = ANY (ARRAY['idle'::character varying, 'calibrating'::character varying, 'upright'::character varying, 'slouching'::character varying, 'sensor_error'::character varying, 'ended'::character varying]::text[])", name: "posture_sessions_state_is_known"
    t.check_constraint "tracked_seconds >= 0 AND tracked_seconds <= '4294967295'::bigint", name: "posture_sessions_tracked_seconds_range"
  end

  add_foreign_key "posture_sessions", "devices"
end
