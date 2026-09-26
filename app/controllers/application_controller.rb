class ApplicationController < ActionController::Base
  include Authentication
  before_action -> { response.headers["Cache-Control"] = "no-store" }
  # Only allow modern browsers supporting webp images, web push, badges, import maps, CSS nesting, and CSS :has.
  allow_browser versions: :modern

  # Changes to the importmap will invalidate the etag for HTML responses
  stale_when_importmap_changes
end
