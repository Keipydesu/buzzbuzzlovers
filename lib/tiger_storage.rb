require "pg"
require "json"
require "securerandom"

# Explicit operator tooling: never invoked by migrations, seeds, or app boot.
module TigerStorage
  class Error < StandardError; end
  TABLE = "public.posture_snapshots".freeze
  AFTER_DAYS = 7

  def self.connect(read_only: true)
    url = ENV["TIGER_DATABASE_URL"].to_s
    raise Error, "Set TIGER_DATABASE_URL in .env." if url.strip.empty?

    ca = ENV["TIGER_SSLROOTCERT"].to_s.strip
    unless ca.empty? || ca == "system" || File.file?(ca)
      raise Error, "TIGER_SSLROOTCERT must point to an existing trusted CA file, not a password or pasted certificate."
    end
    options = {
      sslmode: "verify-full", sslrootcert: ca.empty? ? "system" : ca,
      connect_timeout: 10,
      options: "-c default_transaction_read_only=#{read_only ? 'on' : 'off'} -c statement_timeout=60000 -c lock_timeout=5000"
    }
    password = ENV["TIGER_DATABASE_PASSWORD"]
    options[:password] = password if password && !password.empty?
    PG.connect(url, **options)
  end

  class Inspector
    def initialize(connection)
      @connection = connection
    end

    def status
      version = extension_version
      result = {
        connected: true,
        tls: query("SELECT ssl, version FROM pg_stat_ssl WHERE pid = pg_backend_pid()"),
        postgres_version: query("SHOW server_version").first.fetch("server_version"),
        timescaledb_version: version
      }
      return result.merge(hypertables: [], policies: []) unless version

      result.merge(
        hypertables: query(<<~SQL),
          SELECT hypertable_schema, hypertable_name, num_chunks, compression_enabled
          FROM timescaledb_information.hypertables
          WHERE hypertable_schema = 'public' AND hypertable_name = 'posture_snapshots'
        SQL
        chunks: query(<<~SQL),
          SELECT count(*) AS total, count(*) FILTER (WHERE is_compressed) AS compressed
          FROM timescaledb_information.chunks
          WHERE hypertable_schema = 'public' AND hypertable_name = 'posture_snapshots'
        SQL
        policies: query(<<~SQL)
          SELECT job_id, proc_name, scheduled, config
          FROM timescaledb_information.jobs
          WHERE hypertable_schema = 'public' AND hypertable_name = 'posture_snapshots'
        SQL
      )
    end

    def enable!
      @connection.transaction { configure!("public") }
      status
    end

    # All DDL, generated data, policy registration, and compression are rolled back.
    # No Rails fixtures or writes to application tables are involved.
    def verify!
      check_version!
      schema = "pose_columnstore_probe_#{SecureRandom.hex(6)}"
      table = "#{schema}.posture_snapshots"
      report = nil
      @connection.exec("BEGIN")
      begin
        @connection.exec("CREATE SCHEMA #{identifier(schema)}")
        @connection.exec("CREATE TABLE #{table} (LIKE #{TABLE} INCLUDING ALL)")
        @connection.exec("SELECT #{extension_schema}.create_hypertable(#{literal(table)}, #{extension_schema}.by_range('received_at'))")
        configure!(schema)
        configure!(schema) # Retry must not create a second policy.
        @connection.exec(<<~SQL)
          INSERT INTO #{table}
            (received_at, posture_session_id, sequence, protocol_version, state, tracked_seconds, slouch_seconds, episode_count)
          SELECT TIMESTAMPTZ '2020-01-01 00:00:00+00' + n * INTERVAL '1 second',
            1, n, 1, 'upright', n, n / 10, n / 100
          FROM generate_series(1, 10000) n
        SQL
        before = signature(table)
        chunks = query("SELECT #{extension_schema}.show_chunks(#{literal(table)})::text AS name")
        chunks.each { |chunk| @connection.exec("CALL #{extension_schema}.convert_to_columnstore(#{literal(chunk.fetch('name'))}::regclass)") }
        raise Error, "Compression changed synthetic snapshot data." unless signature(table) == before
        compressed = query("SELECT count(*) AS count FROM timescaledb_information.chunks WHERE hypertable_schema = #{literal(schema)} AND is_compressed").first.fetch("count").to_i
        raise Error, "No synthetic chunks were compressed." if compressed.zero?
        # Verify append, duplicate protection, and deletion on compressed storage.
        @connection.exec("INSERT INTO #{table} SELECT received_at, posture_session_id, sequence, protocol_version, state, tracked_seconds, slouch_seconds, episode_count FROM #{table} ON CONFLICT DO NOTHING")
        raise Error, "Duplicate retry changed synthetic data." unless signature(table) == before
        @connection.exec("INSERT INTO #{table} (received_at, posture_session_id, sequence, protocol_version, state, tracked_seconds, slouch_seconds, episode_count) VALUES ('2020-01-01 00:00:00+00', 2, 1, 1, 'upright', 10, 0, 0)")
        @connection.exec("DELETE FROM #{table} WHERE posture_session_id = 2")
        raise Error, "Append/delete changed original synthetic data." unless signature(table) == before
        policy_count = policies(schema).size
        raise Error, "Expected exactly one synthetic compression policy." unless policy_count == 1
        report = { synthetic_rows: 10000, compressed_chunks: compressed, data_preserved: true, duplicate_safe: true, append_delete: true, policy_count: policy_count }
      ensure
        @connection.exec("ROLLBACK")
      end
      report.merge(rolled_back: true)
    end

    private

    def configure!(schema)
      check_version!
      table = "#{schema}.posture_snapshots"
      hypertable = query("SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_schema = #{literal(schema)} AND hypertable_name = 'posture_snapshots'")
      raise Error, "Snapshot hypertable is missing; prepare the target database separately first." if hypertable.empty?
      existing = policies(schema)
      if existing.any? && (existing.size != 1 || existing.first.fetch("matches_age") != "t" || existing.first.fetch("scheduled") != "t")
        raise Error, "An existing compression policy differs or is paused; review it before changing it."
      end

      @connection.exec(<<~SQL)
        ALTER TABLE #{identifier(schema)}.posture_snapshots SET (
          timescaledb.enable_columnstore = true,
          timescaledb.segmentby = 'posture_session_id',
          timescaledb.orderby = 'received_at DESC'
        )
      SQL
      @connection.exec("CALL #{extension_schema}.add_columnstore_policy(#{literal(table)}::regclass, after => INTERVAL '#{AFTER_DAYS} days', if_not_exists => true)")
    end

    def policies(schema)
      query(<<~SQL)
        SELECT scheduled,
          COALESCE((config->>'compress_after')::interval = INTERVAL '#{AFTER_DAYS} days', false) AS matches_age
        FROM timescaledb_information.jobs
        WHERE hypertable_schema = #{literal(schema)} AND hypertable_name = 'posture_snapshots'
          AND proc_name = 'policy_compression'
      SQL
    end

    def extension_version
      query("SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'").first&.fetch("extversion")
    end

    def check_version!
      version = extension_version
      raise Error, "TimescaleDB 2.18 or newer is required for columnstore." unless version && Gem::Version.new(version) >= Gem::Version.new("2.18")
    end

    def extension_schema
      identifier(query("SELECT nspname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='timescaledb'").first.fetch("nspname"))
    end

    def signature(table)
      query("SELECT count(*), md5(string_agg(row_to_json(s)::text, ',' ORDER BY received_at, posture_session_id, sequence)) FROM #{table} s")
    end

    def query(sql) = @connection.exec(sql).to_a
    def identifier(value) = @connection.escape_identifier(value)
    def literal(value) = @connection.escape_literal(value)
  end
end
