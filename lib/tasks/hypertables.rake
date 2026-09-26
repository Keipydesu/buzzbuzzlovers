# See lib/hypertable_setup.rb for why this exists: db:schema:load and
# db:test:load_schema (used by db:prepare/db:test:prepare, and by
# bin/docker-entrypoint on a fresh container) load db/schema.rb directly and
# mark migrations "up" without running them, so the hypertable conversion
# inside the posture_snapshots migration never executes on that path.
desc "Idempotently establish TimescaleDB hypertables for tables that declare one (see lib/hypertable_setup.rb)"
task ensure_hypertables: :environment do
  HypertableSetup.ensure_all!
end

%w[db:schema:load db:test:load_schema].each do |task_name|
  next unless Rake::Task.task_defined?(task_name)

  Rake::Task[task_name].enhance do
    Rake::Task["ensure_hypertables"].invoke
  end
end
