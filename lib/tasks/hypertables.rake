# The actual fix lives in config/initializers/hypertable_setup.rb, which
# hooks ActiveRecord::Tasks::DatabaseTasks.load_schema directly — the one
# method db:schema:load, db:test:load_schema, AND db:prepare all funnel
# through. See that file and lib/hypertable_setup.rb for why enhancing these
# Rake tasks (an earlier version of this file) isn't sufficient: db:prepare
# calls load_schema directly in Ruby without ever invoking db:schema:load.
#
# This task remains only as a manual convenience for an already-running
# database that needs its hypertable(s) established/re-checked without a
# full schema load (e.g., one restored from a plain SQL dump).
desc "Idempotently establish TimescaleDB hypertables for tables that declare one (see lib/hypertable_setup.rb)"
task ensure_hypertables: :environment do
  HypertableSetup.ensure_all!
end
