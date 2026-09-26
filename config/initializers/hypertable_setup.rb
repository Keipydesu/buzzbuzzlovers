# See lib/hypertable_setup.rb for the underlying problem. The PR #2 review
# also found that enhancing the db:schema:load / db:test:load_schema Rake
# tasks (an earlier version of this file) misses db:prepare: Rails 8.1
# implements it as DatabaseTasks.prepare_all -> initialize_database ->
# load_schema, calling that method directly in Ruby and never touching the
# db:schema:load Rake task at all. bin/docker-entrypoint runs db:prepare, so
# that gap would have silently defeated this fix in exactly the deployment
# path it exists for.
#
# ActiveRecord::Tasks::DatabaseTasks.load_schema is the one method every one
# of these paths actually funnels through — db:schema:load and
# db:test:load_schema call it via load_schema_current, db:prepare calls it
# directly — so it's the correct choke point, not any Rake task. It's called
# from inside DatabaseTasks' own with_temporary_pool/with_temporary_connection
# block for the target db_config, so ActiveRecord::Base.connection still
# resolves to that db_config's connection immediately after `super` returns.
require "active_record/tasks/database_tasks"

ActiveRecord::Tasks::DatabaseTasks.singleton_class.prepend(Module.new do
  def load_schema(*args, **kwargs)
    result = super
    HypertableSetup.ensure_all!
    result
  end
end)
