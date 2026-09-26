module Api
  module V1
    class BaseController < ActionController::Base
      include Authentication
      class ApiError < StandardError
        attr_reader :status, :code, :message_text, :session

        def initialize(status:, code:, message:, session: nil)
          @status = status
          @code = code
          @message_text = message
          @session = session
          super(message)
        end
      end

      protect_from_forgery with: :exception
      wrap_parameters false

      MUTATING_METHODS = %w[POST PUT PATCH].freeze

      prepend_before_action :guard_request

      rescue_from ApiError, with: :render_api_error
      rescue_from ActionController::InvalidAuthenticityToken, with: :render_forbidden
      rescue_from ActionDispatch::Http::Parameters::ParseError, with: :render_malformed_json

      private

      def guard_request
        set_no_store
        return unless mutating_request?

        enforce_json_content_type
      end

      def mutating_request?
        MUTATING_METHODS.include?(request.method)
      end

      def set_no_store
        response.headers["Cache-Control"] = "no-store"
      end

      def enforce_json_content_type
        return if request.media_type == "application/json"

        raise ApiError.new(status: :unsupported_media_type, code: "unsupported_media_type",
          message: "Content-Type must be application/json")
      end

      def render_api_error(error)
        render_error(status: error.status, code: error.code, message: error.message_text, session: error.session)
      end

      def render_forbidden
        render_error(status: :forbidden, code: "forbidden", message: "CSRF/origin check failed")
      end

      def render_malformed_json
        render_error(status: :bad_request, code: "malformed_json", message: "Request body is not valid JSON")
      end

      def render_error(status:, code:, message:, session: nil)
        body = { error: { code: code, message: message } }
        body[:session] = session if session
        render json: body, status: status
      end

      def require_authentication
        render_error(status: :unauthorized, code: "unauthorized", message: "Log in to continue") unless current_user
      end

      def demo_timezone
        Rails.application.config.x.demo_timezone
      end
    end
  end
end
