ENV["BUNDLE_GEMFILE"] ||= File.expand_path("../Gemfile", __dir__)

# Minimal .env loader (no dotenv-style gem dependency, per docs/dependency-safety.md:
# this is a few lines of stdlib string parsing, not a new install/build hook, native
# extension, or transitive dependency to review). Never overrides a variable already
# set in the real environment. See .env.example for what this project expects.
dotenv_path = File.expand_path("../.env", __dir__)
if ENV["SKIP_DOTENV"] != "1" && ENV["RAILS_ENV"] != "test" && File.exist?(dotenv_path)
  File.foreach(dotenv_path) do |line|
    line = line.strip
    next if line.empty? || line.start_with?("#")

    key, value = line.split("=", 2)
    next unless key && value

    ENV[key] ||= value.strip.sub(/\A(['"])(.*)\1\z/, '\2')
  end
end

require "bundler/setup" # Set up gems listed in the Gemfile.
require "bootsnap/setup" # Speed up boot time by caching expensive operations.
