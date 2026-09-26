# Single server-configured demo profile (see docs/APP_PLAN.md "Device registration"
# and docs/app-api.md "Boundary and deployment assumptions"). Not client-supplied;
# v1 has exactly one profile, so there is nothing for a caller to legitimately choose.
Rails.application.config.x.demo_timezone = ENV.fetch("DEMO_TIMEZONE", "America/New_York")
