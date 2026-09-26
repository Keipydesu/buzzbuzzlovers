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

    schema = extension_schema(connection)

    HYPERTABLES.each do |table, time_column|
      next unless connection.table_exists?(table)
      next if hypertable?(connection, table)

      # Schema-qualified (not just relying on search_path already including
      # it): callers may run with a deliberately narrow search_path — see
      # test/lib/hypertable_setup_test.rb's scratch-schema isolation, which
      # needs this to still resolve create_hypertable/by_range regardless.
      connection.execute(
        "SELECT #{schema}.create_hypertable(#{connection.quote(table)}, #{schema}.by_range(#{connection.quote(time_column)}), if_not_exists => TRUE);"
      )
    end
  end

  def self.timescaledb_available?(connection)
    connection.select_value("SELECT 1 FROM pg_extension WHERE extname = 'timescaledb'").present?
  end

  def self.extension_schema(connection)
    connection.quote_table_name(
      connection.select_value(
        "SELECT nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE extname = 'timescaledb'"
      )
    )
  end

  # Resolves `table` the same way create_hypertable itself would (via the
  # current search_path, by comparing OIDs through to_regclass) rather than
  # matching on hypertable_name alone — a bare name match would false-positive
  # against a same-named hypertable in a *different* schema (e.g. a scratch
  # schema used for isolated testing alongside the real one in "public"),
  # silently skipping the create_hypertable call this method exists to guard.
  def self.hypertable?(connection, table)
    return false unless timescaledb_available?(connection)

    connection.select_value(<<~SQL).present?
      SELECT 1 FROM timescaledb_information.hypertables h
      WHERE (quote_ident(h.hypertable_schema) || '.' || quote_ident(h.hypertable_name))::regclass
          = to_regclass(#{connection.quote(table)})
    SQL
  end
end
