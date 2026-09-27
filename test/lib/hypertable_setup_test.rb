require "test_helper"
require "uri"

# Regression coverage for the fresh-bootstrap gap found in PR #2 review.
#
# Deliberately Minitest::Test, not ActiveSupport::TestCase: this repo's
# test_helper.rb declares `fixtures :all` globally, and Rails' fixture-load
# FK validation (check_all_foreign_keys_valid!) tries to resolve every FK in
# the database via an unqualified regclass cast, which fails against
# TimescaleDB's own internal _timescaledb_catalog.tablespace table on any
# timescaledb-enabled database — a general Rails/TimescaleDB fixture-loading
# incompatibility, unrelated to this project's code. These tests need no
# fixtures, so they skip that machinery entirely rather than working around it.
class HypertableSetupTest < Minitest::Test
  extend ActiveSupport::Testing::Declarative

  test "ensure_all! does not raise when timescaledb is unavailable (this repo's local/test default)" do
    skip "this database has timescaledb; see the db:prepare test below" if timescaledb_available?

    HypertableSetup.ensure_all!

    refute hypertable?("posture_snapshots")
  end

  # The first review round's test called HypertableSetup.ensure_all! directly,
  # which cannot detect that db:prepare never reaches it: Rails 8.1 implements
  # db:prepare as DatabaseTasks.prepare_all -> initialize_database ->
  # load_schema, a direct Ruby call that bypasses the db:schema:load Rake task
  # entirely (bin/docker-entrypoint runs db:prepare). This test instead shells
  # out to the real `bin/rails db:prepare` command, against a disposable
  # scratch *schema* on the same database (Tiger Cloud's tsdb_admin role
  # can't CREATE DATABASE — "not an allowed database name" — but can create
  # a schema), with search_path narrowed to just that schema so db:prepare
  # genuinely sees a fresh, uninitialized target rather than the real
  # "public" tables. Verifies the result the same way a human operator would:
  # queries timescaledb_information.hypertables afterward.
  test "the real db:prepare command establishes the hypertable on a fresh timescaledb-enabled schema" do
    skip "run with DATABASE_URL=\"$TIGER_DATABASE_URL\" (or another timescaledb-enabled database) to exercise this" \
      unless timescaledb_available?

    with_scratch_schema do |scratch_url, schema_name|
      env = ENV.to_h.merge("DATABASE_URL" => scratch_url, "RAILS_ENV" => "development", "POSE_DEMO_SEED" => "0")
      success = system(env, "bin/rails", "db:prepare", chdir: Rails.root.to_s, out: File::NULL, err: File::NULL)
      assert success, "bin/rails db:prepare (against the scratch schema) exited non-zero"

      result = ActiveRecord::Base.connection.select_value(<<~SQL)
        SELECT 1 FROM timescaledb_information.hypertables
        WHERE hypertable_name = 'posture_snapshots' AND hypertable_schema = #{ActiveRecord::Base.connection.quote(schema_name)}
      SQL
      assert result.present?, "expected posture_snapshots to be a hypertable in #{schema_name} after db:prepare"
    end
  end

  private

  def timescaledb_available?
    HypertableSetup.timescaledb_available?(ActiveRecord::Base.connection)
  end

  def hypertable?(table)
    HypertableSetup.hypertable?(ActiveRecord::Base.connection, table)
  end

  def with_scratch_schema
    connection = ActiveRecord::Base.connection
    schema_name = "hypertable_prepare_scratch_#{SecureRandom.hex(6)}"
    connection.execute("CREATE SCHEMA #{connection.quote_table_name(schema_name)}")

    begin
      yield narrow_search_path(base_url, schema_name), schema_name
    ensure
      connection.execute("DROP SCHEMA IF EXISTS #{connection.quote_table_name(schema_name)} CASCADE")
    end
  end

  def base_url
    ENV.fetch("DATABASE_URL") { ENV.fetch("TIGER_DATABASE_URL") }
  end

  # Excludes "public" deliberately: including it as a fallback would let
  # db:prepare's schema_migrations existence check resolve to the *real*
  # table there via search_path, wrongly treating the scratch schema as
  # already initialized and skipping load_schema entirely.
  def narrow_search_path(url, schema_name)
    uri = URI.parse(url)
    options = URI.encode_www_form_component("-c search_path=#{schema_name}").gsub("+", "%20")
    uri.query = [ uri.query, "options=#{options}" ].compact.join("&")
    uri.to_s
  end
end
