require "test_helper"

class Snapshots::IngestTest < ActiveSupport::TestCase
  DEVICE_ID = "00112233445566778899aabbccddeeff"

  def build_ingest(device, device_session_id, overrides = {})
    Snapshots::Ingest.new(
      device: device,
      device_session_id: device_session_id,
      snapshot: {
        protocol_version: 1, state: "upright", sequence: 12,
        tracked_seconds: 60, slouch_seconds: 10, episode_count: 2
      }.merge(overrides),
      first_observed_at: Time.current,
      calendar_timezone: "America/New_York"
    )
  end

  test "a concurrent first insert retries and reconciles against the winning row" do
    device = Device.register(DEVICE_ID).device

    # Simulate the race: another request's create commits between this
    # request's initial lock/find and its own create attempt. We force the
    # *first* PostureSession.lock call (inside the first perform attempt) to
    # miss the row a concurrent request already inserted, then let subsequent
    # calls (the retry) behave normally. This is exactly the scenario
    # requires_new: true (see app/services/snapshots/ingest.rb) protects: without
    # it, the RecordNotUnique here would abort the whole enclosing transaction
    # (as it does under this test's transactional fixtures) and the retry
    # below would fail with "transaction is aborted" instead of succeeding.
    PostureSession.create!(
      device: device, device_session_id: 7, protocol_version: 1, last_sequence: 12,
      state: "upright", tracked_seconds: 60, slouch_seconds: 10, episode_count: 2,
      first_received_at: Time.current, last_received_at: Time.current, first_observed_at: Time.current,
      calendar_timezone: "America/New_York", calendar_day: Date.current
    )

    attempt = 0
    real_lock = PostureSession.method(:lock)
    PostureSession.define_singleton_method(:lock) do
      attempt += 1
      attempt == 1 ? Class.new { def find_by(*) = nil }.new : real_lock.call
    end

    begin
      result = build_ingest(device, 7).call
    ensure
      PostureSession.singleton_class.send(:remove_method, :lock)
    end

    assert_equal :duplicate, result.disposition
    assert_equal 1, PostureSession.where(device: device, device_session_id: 7).count
  end

  test "a valid first insert is accepted" do
    device = Device.register(DEVICE_ID).device

    result = build_ingest(device, 7).call

    assert_equal :accepted, result.disposition
    assert_equal 60, result.session.tracked_seconds
  end

  test "an accepted first insert writes exactly one history row with the session's own receipt timestamp" do
    device = Device.register(DEVICE_ID).device

    result = build_ingest(device, 7).call

    assert_equal 1, PostureSnapshot.where(posture_session_id: result.session.id).count
    snapshot = PostureSnapshot.find_by!(posture_session_id: result.session.id, sequence: 12)
    assert_equal result.session.first_received_at.to_i, snapshot.received_at.to_i
    assert_equal 60, snapshot.tracked_seconds
  end

  test "an accepted later revision writes another history row, not a rewrite of the first" do
    device = Device.register(DEVICE_ID).device
    build_ingest(device, 7).call
    result = build_ingest(device, 7, sequence: 13, tracked_seconds: 90, slouch_seconds: 20).call

    assert_equal :accepted, result.disposition
    assert_equal 2, PostureSnapshot.where(posture_session_id: result.session.id).count
    assert PostureSnapshot.exists?(posture_session_id: result.session.id, sequence: 12, tracked_seconds: 60)
    assert PostureSnapshot.exists?(posture_session_id: result.session.id, sequence: 13, tracked_seconds: 90)
  end

  test "stale, duplicate, and conflicting requests never write history rows" do
    device = Device.register(DEVICE_ID).device
    build_ingest(device, 7).call

    build_ingest(device, 7, sequence: 5).call # stale
    build_ingest(device, 7).call # duplicate
    build_ingest(device, 7, tracked_seconds: 999).call # conflict

    assert_equal 1, PostureSnapshot.where(posture_session_id: PostureSession.find_by!(device: device, device_session_id: 7).id).count
  end
end
