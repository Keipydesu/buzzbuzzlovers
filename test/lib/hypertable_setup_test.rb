require "test_helper"

# Regression coverage for the fresh-bootstrap gap found in PR #2 review:
# db:schema:load/db:test:load_schema/db:prepare (and bin/docker-entrypoint on
# a fresh container) load db/schema.rb directly and mark migrations "up"
# without running them, so the hypertable conversion inside the
# posture_snapshots migration's `up` method never executes on that path.
# HypertableSetup.ensure_all! (invoked after schema load — see
# lib/tasks/hypertables.rake) is what actually closes that gap.
#
# Deliberately Minitest::Test, not ActiveSupport::TestCase: this repo's
# test_helper.rb declares `fixtures :all` globally, and Rails' fixture-load
# FK validation (check_all_foreign_keys_valid!) tries to resolve every FK in
# the database via an unqualified regclass cast, which fails against
# TimescaleDB's own internal _timescaledb_catalog.tablespace table on any
# timescaledb-enabled database — a general Rails/TimescaleDB fixture-loading
# incompatibility, unrelated to this project's code. This test needs no
# fixtures, so it skips that machinery entirely rather than working around it.
class HypertableSetupTest < Minitest::Test
  extend ActiveSupport::Testing::Declarative

  test "ensure_all! does not raise when timescaledb is unavailable (this repo's local/test default)" do
    skip "this database has timescaledb; see the Tiger Cloud test below" if timescaledb_available?

    HypertableSetup.ensure_all!

    refute hypertable?("posture_snapshots")
  end

  test "ensure_all! converts posture_snapshots into a real hypertable on a timescaledb-enabled database" do
    skip "run with DATABASE_URL=\"$TIGER_DATABASE_URL\" (or another timescaledb-enabled database) to exercise this" \
      unless timescaledb_available?

    HypertableSetup.ensure_all!

    assert hypertable?("posture_snapshots")
  end

  private

  def timescaledb_available?
    HypertableSetup.timescaledb_available?(ActiveRecord::Base.connection)
  end

  def hypertable?(table)
    HypertableSetup.hypertable?(ActiveRecord::Base.connection, table)
  end
end
