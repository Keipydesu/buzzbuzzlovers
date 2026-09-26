# Idempotently establishes TimescaleDB hypertables for tables that declare
# one. db/schema.rb necessarily describes posture_snapshots as an ordinary
# table (that's the honest state of it on local PostgreSQL, which lacks the
# timescaledb extension — see the migration's own comment), so bootstrapping
# a fresh database via db:schema:load/db:prepare (as bin/docker-entrypoint
# does) marks the migration "applied" without ever running its `up` method,
# and the hypertable conversion in it never happens. This module is invoked
# after schema load (see config/initializers/hypertable_setup.rb) to close
# that gap, independent of whether the database was set up via db:migrate
# or db:schema:load.
module HypertableSetup
  # table name => time-partitioning column name
  HYPERTABLES = {
    "posture_snapshots" => "received_at"
  }.freeze

  def self.ensure_all!
    connection = ActiveRecord::Base.connection
    return unless timescaledb_available?(connection)

    HYPERTABLES.each do |table, time_column|
      next unless connection.table_exists?(table)
      next if hypertable?(connection, table)

      connection.execute(
        "SELECT create_hypertable(#{connection.quote(table)}, by_range(#{connection.quote(time_column)}), if_not_exists => TRUE);"
      )
    end
  end

  def self.timescaledb_available?(connection)
    connection.select_value("SELECT 1 FROM pg_extension WHERE extname = 'timescaledb'").present?
  end

  def self.hypertable?(connection, table)
    return false unless timescaledb_available?(connection)

    connection.select_value(
      "SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_name = #{connection.quote(table)}"
    ).present?
  end
end
