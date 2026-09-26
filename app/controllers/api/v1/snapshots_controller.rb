module Api
  module V1
    class SnapshotsController < BaseController
      SNAPSHOT_KEYS = %w[protocol_version state sequence tracked_seconds slouch_seconds episode_count].freeze
      MAX_FUTURE_CLOCK_SKEW = 5.minutes
      # RFC 3339 instant with a mandatory explicit offset (Z or +HH:MM/-HH:MM).
      # Time.iso8601 alone accepts an offset-free string and silently assumes
      # the server's local timezone, which can freeze the wrong calendar day.
      RFC3339_WITH_OFFSET = /\A\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})\z/

      def update
        device_id = extract_device_id
        device_session_id = extract_device_session_id
        device = find_device!(device_id)

        body = request.request_parameters
        if body.keys.sort != %w[observation snapshot]
          raise ApiError.new(status: :unprocessable_entity, code: "invalid_snapshot",
            message: "Request must contain exactly snapshot and observation")
        end

        snapshot = validate_snapshot!(body["snapshot"])
        first_observed_at = validate_observation!(body["observation"])

        result = Snapshots::Ingest.new(
          device: device,
          device_session_id: device_session_id,
          snapshot: snapshot,
          first_observed_at: first_observed_at,
          calendar_timezone: demo_timezone
        ).call

        respond(result)
      end

      private

      def extract_device_id
        device_id = params[:device_id]
        return device_id if device_id.is_a?(String) && device_id.match?(Device::DEVICE_ID_FORMAT)

        raise ApiError.new(status: :bad_request, code: "invalid_path",
          message: "device_id must be 32 lowercase hex characters")
      end

      def extract_device_session_id
        raw = params[:device_session_id]
        unless raw.is_a?(String) && raw.match?(/\A[0-9]+\z/)
          raise ApiError.new(status: :bad_request, code: "invalid_path",
            message: "device_session_id must be a decimal integer")
        end

        value = raw.to_i
        unless value.between?(1, PostureSession::UINT32_MAX)
          raise ApiError.new(status: :bad_request, code: "invalid_path",
            message: "device_session_id out of range")
        end

        value
      end

      def find_device!(device_id)
        Device.find_by(id: device_id) ||
          raise(ApiError.new(status: :not_found, code: "device_not_found", message: "Device is not registered"))
      end

      def validate_snapshot!(snapshot)
        unless snapshot.is_a?(Hash) && snapshot.keys.sort == SNAPSHOT_KEYS.sort
          raise invalid_snapshot("snapshot must contain exactly #{SNAPSHOT_KEYS.join(', ')}")
        end

        raise invalid_snapshot("protocol_version must be 1") unless strict_int?(snapshot["protocol_version"], 1, 1)
        raise invalid_snapshot("state must be a known state") unless PostureSession::STATES.include?(snapshot["state"])
        raise invalid_snapshot("sequence out of range") unless strict_int?(snapshot["sequence"], 1, PostureSession::UINT32_MAX)
        raise invalid_snapshot("tracked_seconds out of range") unless strict_int?(snapshot["tracked_seconds"], 0, PostureSession::UINT32_MAX)
        raise invalid_snapshot("slouch_seconds out of range") unless strict_int?(snapshot["slouch_seconds"], 0, PostureSession::UINT32_MAX)
        raise invalid_snapshot("episode_count out of range") unless strict_int?(snapshot["episode_count"], 0, PostureSession::UINT16_MAX)
        raise invalid_snapshot("slouch_seconds must not exceed tracked_seconds") if snapshot["slouch_seconds"] > snapshot["tracked_seconds"]

        {
          protocol_version: snapshot["protocol_version"],
          state: snapshot["state"],
          sequence: snapshot["sequence"],
          tracked_seconds: snapshot["tracked_seconds"],
          slouch_seconds: snapshot["slouch_seconds"],
          episode_count: snapshot["episode_count"]
        }
      end

      def validate_observation!(observation)
        unless observation.is_a?(Hash) && observation.keys == [ "first_observed_at" ]
          raise invalid_observation("observation must contain exactly first_observed_at")
        end

        raw = observation["first_observed_at"]
        raise invalid_observation("first_observed_at must be a string") unless raw.is_a?(String)
        unless raw.match?(RFC3339_WITH_OFFSET)
          raise invalid_observation("first_observed_at must be an RFC 3339 timestamp with an explicit offset")
        end

        year, month, day = raw[0, 10].split("-").map(&:to_i)
        unless Date.valid_date?(year, month, day, Date::GREGORIAN)
          raise invalid_observation("first_observed_at must contain a valid calendar date")
        end

        begin
          timestamp = Time.iso8601(raw)
        rescue ArgumentError
          raise invalid_observation("first_observed_at must be an RFC 3339 timestamp with an explicit offset")
        end

        if timestamp > Time.current + MAX_FUTURE_CLOCK_SKEW
          raise invalid_observation("first_observed_at is too far in the future")
        end

        timestamp
      end

      def strict_int?(value, min, max)
        value.is_a?(Integer) && !value.is_a?(TrueClass) && !value.is_a?(FalseClass) && value.between?(min, max)
      end

      def invalid_snapshot(message)
        ApiError.new(status: :unprocessable_entity, code: "invalid_snapshot", message: message)
      end

      def invalid_observation(message)
        ApiError.new(status: :unprocessable_entity, code: "invalid_observation", message: message)
      end

      def respond(result)
        session_json = SessionSerializer.call(result.session)

        case result.disposition
        when :accepted, :duplicate, :stale
          render json: { disposition: result.disposition.to_s, session: session_json }
        when :error
          status = result.error_code == "counter_regression" ? :unprocessable_entity : :conflict
          render json: {
            error: { code: result.error_code, message: error_message(result.error_code) },
            session: session_json
          }, status: status
        end
      end

      def error_message(code)
        {
          "snapshot_conflict" => "This revision has different recorded values.",
          "session_ended" => "This session has already ended.",
          "counter_regression" => "Cumulative counters must not decrease within a session."
        }.fetch(code)
      end
    end
  end
end
