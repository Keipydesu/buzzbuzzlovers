module Api
  module V1
    class SessionsController < BaseController
      def show
        device_id = params[:device_id]
        unless device_id.is_a?(String) && device_id.match?(Device::DEVICE_ID_FORMAT)
          raise ApiError.new(status: :bad_request, code: "invalid_path",
            message: "device_id must be 32 lowercase hex characters")
        end

        device = current_user.devices.find_by(id: device_id)
        raise ApiError.new(status: :not_found, code: "device_not_found", message: "Device is not registered") unless device

        session = device.posture_sessions.order(device_session_id: :desc).first
        render json: { session: session && SessionSerializer.call(session) }
      end
    end
  end
end
