require_relative "../../../config/environment"
require_relative "guard"
E2eGuard.check!
require "active_support/testing/time_helpers"
extend ActiveSupport::Testing::TimeHelpers
travel_to Time.utc(2026, 9, 23, 16)
ActionController::Base.allow_forgery_protection = true
# This adapter exists only in this test Rack entrypoint. Never contact Meta.
module E2eCoach
  def call(question)
    raise Muse::Coach::Unavailable, "Muse is not connected yet." unless self.class.configured?
    if question == "Simulate unavailable service"
      raise Muse::Coach::Unavailable, "Muse could not respond right now. Please try again later."
    end
    "Try a comfortable screen distance. <script>window.untrustedCoach = true</script>"
  end
end
Muse::Coach.prepend(E2eCoach)
Muse::Coach.define_singleton_method(:configured?) do
  File.read(Rails.root.join("tmp/e2e-coach-mode")) == "available"
end
run Rails.application
