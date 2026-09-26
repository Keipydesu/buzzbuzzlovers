module Snapshots
  # Atomic compare-and-replace for one (device_id, device_session_id) snapshot,
  # per docs/app-api.md "Atomic reconciliation and acknowledgments". Branch order
  # matters: an equal-sequence identical retry is always a duplicate, even against
  # an already-ended row, before we ever check the ended/regression branches.
  class Ingest
    Result = Struct.new(:disposition, :session, :error_code, keyword_init: true) do
      def accepted? = disposition == :accepted
    end

    def initialize(device:, device_session_id:, snapshot:, first_observed_at:, calendar_timezone:)
      @device = device
      @device_session_id = device_session_id
      @snapshot = snapshot
      @first_observed_at = first_observed_at
      @calendar_timezone = calendar_timezone
    end

    def call
      attempts = 0
      begin
        perform
      rescue ActiveRecord::RecordNotUnique
        attempts += 1
        retry if attempts < 3
        raise
      end
    end

    private

    attr_reader :device, :device_session_id, :snapshot, :first_observed_at, :calendar_timezone

    def perform
      result = nil
      # requires_new: true opens a savepoint rather than joining any transaction
      # already open on this connection. Without it, a RecordNotUnique here
      # would abort the whole enclosing transaction (test transactional
      # fixtures, a future caller), and the retried attempt below would fail too.
      ActiveRecord::Base.transaction(requires_new: true) do
        session = PostureSession.lock.find_by(device: device, device_session_id: device_session_id)
        result = session.nil? ? create_session : reconcile(session)
        raise ActiveRecord::Rollback unless result.accepted?
      end
      result
    end

    def create_session
      now = Time.current
      session = PostureSession.new(
        device: device,
        device_session_id: device_session_id,
        protocol_version: snapshot[:protocol_version],
        state: snapshot[:state],
        last_sequence: snapshot[:sequence],
        tracked_seconds: snapshot[:tracked_seconds],
        slouch_seconds: snapshot[:slouch_seconds],
        episode_count: snapshot[:episode_count],
        ended: snapshot[:state] == "ended",
        first_received_at: now,
        last_received_at: now,
        first_observed_at: first_observed_at,
        calendar_timezone: calendar_timezone,
        calendar_day: first_observed_at.in_time_zone(calendar_timezone).to_date
      )
      session.save!
      record_history!(session, received_at: now)
      Result.new(disposition: :accepted, session: session)
    end

    def reconcile(session)
      incoming_sequence = snapshot[:sequence]

      return Result.new(disposition: :stale, session: session) if incoming_sequence < session.last_sequence

      if incoming_sequence == session.last_sequence
        return if_identical_else_conflict(session)
      end

      return Result.new(disposition: :error, session: session, error_code: "session_ended") if session.ended?

      if snapshot[:tracked_seconds] < session.tracked_seconds ||
         snapshot[:slouch_seconds] < session.slouch_seconds ||
         snapshot[:episode_count] < session.episode_count
        return Result.new(disposition: :error, session: session, error_code: "counter_regression")
      end

      apply(session)
      Result.new(disposition: :accepted, session: session)
    end

    def if_identical_else_conflict(session)
      canonical_incoming = {
        protocol_version: snapshot[:protocol_version],
        state: snapshot[:state],
        last_sequence: snapshot[:sequence],
        tracked_seconds: snapshot[:tracked_seconds],
        slouch_seconds: snapshot[:slouch_seconds],
        episode_count: snapshot[:episode_count]
      }

      if session.matches_canonical?(canonical_incoming)
        Result.new(disposition: :duplicate, session: session)
      else
        Result.new(disposition: :error, session: session, error_code: "snapshot_conflict")
      end
    end

    def apply(session)
      now = Time.current
      session.assign_attributes(
        protocol_version: snapshot[:protocol_version],
        state: snapshot[:state],
        last_sequence: snapshot[:sequence],
        tracked_seconds: snapshot[:tracked_seconds],
        slouch_seconds: snapshot[:slouch_seconds],
        episode_count: snapshot[:episode_count],
        ended: snapshot[:state] == "ended",
        last_received_at: now
      )
      session.save!
      record_history!(session, received_at: now)
    end

    # One history row per accepted revision (docs/data-storage.md "Atomic ingestion
    # and retry behavior"): never for rejected/stale/duplicate/conflicting requests,
    # and always the same server acceptance timestamp used for the session's own
    # first/last_received_at — never the device's or browser's observation time.
    def record_history!(session, received_at:)
      PostureSnapshot.create!(
        posture_session: session,
        received_at: received_at,
        protocol_version: snapshot[:protocol_version],
        state: snapshot[:state],
        sequence: snapshot[:sequence],
        tracked_seconds: snapshot[:tracked_seconds],
        slouch_seconds: snapshot[:slouch_seconds],
        episode_count: snapshot[:episode_count]
      )
    end
  end
end
