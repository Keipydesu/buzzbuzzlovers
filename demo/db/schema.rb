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

ActiveRecord::Schema[8.1].define(version: 2026_09_26_000000) do
  create_table "demo_sessions", force: :cascade do |t|
    t.integer "protocol_version", null: false
    t.string "state", null: false
    t.integer "sequence", null: false
    t.integer "tracked_seconds", null: false
    t.integer "slouch_seconds", null: false
    t.integer "episode_count", null: false
    t.datetime "first_observed_at", null: false
    t.date "calendar_day", null: false
    t.string "calendar_timezone", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.check_constraint "episode_count BETWEEN 0 AND 65535 AND sequence BETWEEN 1 AND 4294967295 AND id BETWEEN 1 AND 4294967295", name: "valid_counters"
    t.check_constraint "protocol_version = 1 AND state IN ('idle','calibrating','upright','slouching','sensor_error','ended')", name: "valid_protocol"
    t.check_constraint "slouch_seconds >= 0 AND slouch_seconds <= tracked_seconds AND tracked_seconds <= 4294967295", name: "valid_durations"
  end
end
