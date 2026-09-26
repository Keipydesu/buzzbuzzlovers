# Accepted-revision history table per docs/data-storage.md. Converted to a
# TimescaleDB hypertable (partitioned on received_at) when the timescaledb
# extension is available on the target database (Tiger Cloud); otherwise left
# as an ordinary table so local development/test — which run against plain
# PostgreSQL, per this repo's chosen scope — still get a fully working table
# to exercise the same INSERT/model logic against. See
# docs/decisions/003-online-storage-with-tiger-data.md.
#
# received_at is the server's *acceptance* time (Snapshots::Ingest's `now`,
# the same value written to the session's first/last_received_at for that
# revision) — never the device's or browser's observation time, which the
# session row already freezes separately as first_observed_at/calendar_day.
class CreatePostureSnapshots < ActiveRecord::Migration[8.1]
  STATES = %w[idle calibrating upright slouching sensor_error ended].freeze
  UINT32_MAX = 4_294_967_295
  UINT16_MAX = 65_535

  def up
    create_table :posture_snapshots, primary_key: [ :received_at, :posture_session_id, :sequence ] do |t|
      t.column :received_at, "timestamptz", null: false
      t.bigint :posture_session_id, null: false
      t.integer :protocol_version, null: false, default: 1
      t.string :state, null: false
      t.bigint :sequence, null: false
      t.bigint :tracked_seconds, null: false
      t.bigint :slouch_seconds, null: false
      t.integer :episode_count, null: false
    end

    # Not add_foreign_key: a hypertable's partition key (received_at) isn't
    # part of this reference, and TimescaleDB does not support foreign keys
    # from other tables *into* a hypertable — only *out* of one, which is what
    # this is. A plain index (not a DB-enforced FK) keeps this working
    # identically whether or not create_hypertable below actually runs.
    add_index :posture_snapshots, [ :posture_session_id, :sequence ],
      name: "index_posture_snapshots_on_session_and_sequence"

    add_check_constraint :posture_snapshots, "protocol_version = 1",
      name: "posture_snapshots_protocol_version_is_one"
    add_check_constraint :posture_snapshots, "state IN (#{STATES.map { |s| "'#{s}'" }.join(', ')})",
      name: "posture_snapshots_state_is_known"
    add_check_constraint :posture_snapshots, "sequence BETWEEN 1 AND #{UINT32_MAX}",
      name: "posture_snapshots_sequence_range"
    add_check_constraint :posture_snapshots, "tracked_seconds BETWEEN 0 AND #{UINT32_MAX}",
      name: "posture_snapshots_tracked_seconds_range"
    add_check_constraint :posture_snapshots, "slouch_seconds BETWEEN 0 AND #{UINT32_MAX}",
      name: "posture_snapshots_slouch_seconds_range"
    add_check_constraint :posture_snapshots, "slouch_seconds <= tracked_seconds",
      name: "posture_snapshots_slouch_within_tracked"
    add_check_constraint :posture_snapshots, "episode_count BETWEEN 0 AND #{UINT16_MAX}",
      name: "posture_snapshots_episode_count_range"

    if timescaledb_available?
      # create_default_indexes (default true) already adds an index on the
      # time dimension. docs/data-storage.md's other proposed index,
      # (user_id, received_at DESC), waits on the accounts work (user_id
      # isn't in scope of this migration — see the file-level comment).
      execute("SELECT create_hypertable('posture_snapshots', by_range('received_at'), if_not_exists => TRUE);")
    else
      say "timescaledb extension not available on this database; posture_snapshots created as an ordinary table (see migration comment).", true
    end
  end

  def down
    drop_table :posture_snapshots
  end

  private

  def timescaledb_available?
    select_value("SELECT 1 FROM pg_extension WHERE extname = 'timescaledb'").present?
  end
end
