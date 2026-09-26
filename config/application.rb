require_relative "boot"

require "rails/all"
require_relative "../lib/middleware/api_body_limit"

# Require the gems listed in Gemfile, including any gems
# you've limited to :test, :development, or :production.
Bundler.require(*Rails.groups)

module Buzzbuzzlovers
  class Application < Rails::Application
    # Initialize configuration defaults for originally generated Rails version.
    config.load_defaults 8.1
    config.middleware.insert_before 0, Middleware::ApiBodyLimit

    # Please, add to the `ignore` list any other `lib` subdirectories that do
    # not contain `.rb` files, or that should not be reloaded or eager loaded.
    # Common ones are `templates`, `generators`, or `middleware`, for example.
    config.autoload_lib(ignore: %w[assets tasks middleware])

    # Never auto-dump db/schema.rb after a migration. This app's primary
    # connection can point at either local PostgreSQL or Tiger Cloud
    # (DATABASE_URL="$TIGER_DATABASE_URL" — see .env.example), and an
    # auto-dump after migrating against Tiger Cloud would bake its
    # cloud-only extensions (timescaledb, pg_stat_statements, ...) into the
    # committed schema.rb, breaking `db:schema:load`/`db:test:prepare` for
    # everyone on local PostgreSQL. Run `bin/rails db:schema:dump` explicitly
    # (with DATABASE_URL unset) when schema.rb needs to be updated.
    config.active_record.dump_schema_after_migration = false

    # Configuration for the application, engines, and railties goes here.
    #
    # These settings can be overridden in specific environments using the files
    # in config/environments, which are processed later.
    #
    # config.time_zone = "Central Time (US & Canada)"
    # config.eager_load_paths << Rails.root.join("extras")
  end
end
