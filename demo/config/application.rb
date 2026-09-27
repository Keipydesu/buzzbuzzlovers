require_relative "boot"
require "rails"
require "active_record/railtie"
require "action_controller/railtie"
require "action_view/railtie"
require "rails/test_unit/railtie"
Bundler.require(*Rails.groups)
module BuzzDemo
  class Application < Rails::Application
    config.load_defaults 8.1
    config.eager_load = false
    config.time_zone = ENV.fetch("DEMO_TIMEZONE", "America/New_York")
    config.secret_key_base = ENV.fetch("SECRET_KEY_BASE", "local-only-buzz-demo-" * 8)
    config.hosts = ["localhost", "127.0.0.1", "www.example.com"]
    config.public_file_server.enabled = true
  end
end
