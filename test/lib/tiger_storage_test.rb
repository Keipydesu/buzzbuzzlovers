require "test_helper"
require Rails.root.join("lib/tiger_storage")

class TigerStorageTest < Minitest::Test
  extend ActiveSupport::Testing::Declarative
  include MethodReplacement
  test "connection enforces verified TLS and defaults to read-only" do
    previous = ENV.values_at("TIGER_DATABASE_URL", "TIGER_SSLROOTCERT")
    ENV["TIGER_DATABASE_URL"] = "postgresql://example.invalid/db?sslmode=require"
    ENV["TIGER_SSLROOTCERT"] = "/trusted/provider-ca.pem"
    captured = nil
    with_method_replaced(File, :file?, ->(path) { path == "/trusted/provider-ca.pem" }) do
      with_method_replaced(PG, :connect, ->(*args, **options) { captured = [ args, options ] }) do
        TigerStorage.connect
      end
    end
    options = captured.last
    assert_equal "verify-full", options[:sslmode]
    assert_equal "/trusted/provider-ca.pem", options[:sslrootcert]
    assert_includes options[:options], "default_transaction_read_only=on"
  ensure
    ENV["TIGER_DATABASE_URL"], ENV["TIGER_SSLROOTCERT"] = previous
  end

  test "plain local PostgreSQL reports status and refuses compression without writes" do
    connection = ActiveRecord::Base.connection.raw_connection
    skip "This check requires ordinary PostgreSQL" if connection.exec("SELECT 1 FROM pg_extension WHERE extname='timescaledb'").ntuples.positive?
    inspector = TigerStorage::Inspector.new(connection)
    assert_nil inspector.status[:timescaledb_version]
    assert_empty inspector.status[:hypertables]
    before = PostureSnapshot.count
    assert_raises(TigerStorage::Error) { inspector.enable! }
    assert_raises(TigerStorage::Error) { inspector.verify! }
    assert_equal before, PostureSnapshot.count
  end

  test "blank CA uses system trust and a separate database password overrides the URL" do
    names = %w[TIGER_DATABASE_URL TIGER_SSLROOTCERT TIGER_DATABASE_PASSWORD]
    previous = ENV.values_at(*names)
    ENV["TIGER_DATABASE_URL"] = "postgresql://example.invalid/db"
    ENV["TIGER_SSLROOTCERT"] = " "
    ENV["TIGER_DATABASE_PASSWORD"] = "example-password"
    captured = nil
    with_method_replaced(PG, :connect, ->(*, **options) { captured = options }) { TigerStorage.connect }
    assert_equal "system", captured[:sslrootcert]
    assert_equal "example-password", captured[:password]
  ensure
    names.zip(previous).each { |name, value| ENV[name] = value }
  end

  test "a missing CA file gets a useful error without echoing its value" do
    previous = ENV.values_at("TIGER_DATABASE_URL", "TIGER_SSLROOTCERT")
    ENV["TIGER_DATABASE_URL"] = "postgresql://example.invalid/db"
    ENV["TIGER_SSLROOTCERT"] = "/missing/private-certificate-value.pem"
    error = assert_raises(TigerStorage::Error) { TigerStorage.connect }
    assert_includes error.message, "existing trusted CA file"
    refute_includes error.message, "private-certificate-value"
  ensure
    ENV["TIGER_DATABASE_URL"], ENV["TIGER_SSLROOTCERT"] = previous
  end
end
