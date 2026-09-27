module Api
  module V1
    class DevicesController < BaseController
      def index
        devices = current_user.devices.order(:first_seen_at)
        render json: { devices: devices.map { |device| serialize(device) } }
      end

      def create
        body = request.request_parameters
        if body.keys != [ "device_id" ]
          raise ApiError.new(status: :bad_request, code: "invalid_request",
            message: "Request body must contain exactly device_id")
        end

        device_id = body["device_id"]
        unless device_id.is_a?(String) && device_id.match?(Device::DEVICE_ID_FORMAT)
          raise ApiError.new(status: :bad_request, code: "invalid_device_id",
            message: "device_id must be 32 lowercase hex characters")
        end

        device = Device.provision!(device_id: device_id, user: current_user)
        render json: { device: serialize(device) }, status: :ok
      rescue Device::OwnershipUnavailable
        raise ApiError.new(status: :not_found, code: "device_not_found", message: "Device is unavailable for this account")
      end

      private

      def serialize(device)
        { device_id: device.id }
      end
    end
  end
end
