require "test_helper"

class WeeklyCompetitionQueryTest < ActiveSupport::TestCase
  setup do
    @alice = User.create!(username: "alice", password: "test password long")
    @bob = User.create!(username: "bob", password: "test password long")
    @casey = User.create!(username: "casey", password: "test password long")
    @group = Group.start!(name: "Crew", creator: @alice)
    [ @bob, @casey ].each { |user| @group.group_invitation.join!(user) }
    @now = Time.iso8601("2026-09-26T16:00:00Z")
  end

  test "weights by recorded duration, shares exact ranks and leaves no data unranked" do
    record(@alice, tracked: 100, slouch: 50)
    record(@alice, tracked: 900, slouch: 0)
    record(@bob, tracked: 20, slouch: 1)
    outsider = User.create!(username: "outsider", password: "test password long")
    record(outsider, tracked: 100, slouch: 0)
    result = query
    assert_equal [ "alice", "bob", "casey" ], result.entries.map { |entry| entry.user.username }
    assert_equal [ 1, 1, nil ], result.entries.map(&:rank)
    assert_equal Rational(1, 20), result.entries.first.ratio
    assert_empty result.most_improved
    record(@casey, tracked: 1, slouch: 0)
    assert_equal [ 1, 2, 2 ], query.entries.map(&:rank)
    assert_equal "casey", query.entries.first.user.username
  end

  test "most improved uses positive percentage point change without changing rank" do
    record(@alice, tracked: 100, slouch: 50, observed: @now - 7.days)
    record(@alice, tracked: 100, slouch: 20)
    record(@bob, tracked: 100, slouch: 5, observed: @now - 7.days)
    record(@bob, tracked: 100, slouch: 1)
    result = query
    assert_equal "bob", result.entries.first.user.username
    assert_equal [ @alice ], result.most_improved.map(&:user)
    assert_equal 30, result.most_improved.first.improvement
  end

  test "no false improvement for worsening missing history or zero prior slouch" do
    record(@alice, tracked: 100, slouch: 0, observed: @now - 7.days)
    record(@alice, tracked: 100, slouch: 5)
    record(@bob, tracked: 100, slouch: 0)
    record(@casey, tracked: 100, slouch: 20, observed: @now - 7.days)
    assert_empty query.most_improved
  end

  test "fixed app zone week boundaries use first observation rather than personal date or receipt" do
    record(@alice, tracked: 100, slouch: 50, observed: Time.iso8601("2026-09-21T03:59:59Z"))
    record(@alice, tracked: 100, slouch: 10, observed: Time.iso8601("2026-09-21T04:00:00Z"), personal_zone: "Asia/Tokyo")
    record(@alice, tracked: 100, slouch: 20, observed: Time.iso8601("2026-09-28T03:59:59Z"))
    record(@alice, tracked: 100, slouch: 100, observed: Time.iso8601("2026-09-28T04:00:00Z"))
    result = query
    assert_equal Date.new(2026, 9, 21), result.week_start
    assert_equal 200, result.entries.first.tracked_seconds
    assert_equal Rational(15, 100), result.entries.first.ratio
  end

  test "calendar weeks account for daylight saving transitions" do
    @now = Time.iso8601("2026-11-01T17:00:00Z")
    record(@alice, tracked: 100, slouch: 10, observed: Time.iso8601("2026-11-02T04:59:59Z"))
    record(@alice, tracked: 100, slouch: 99, observed: Time.iso8601("2026-11-02T05:00:00Z"))
    assert_equal 100, query.entries.first.tracked_seconds
  end

  test "duplicate snapshot does not increase score totals and later revision replaces totals" do
    session = record(@alice, tracked: 100, slouch: 10)
    snapshot = { protocol_version: 1, state: "upright", sequence: 1, tracked_seconds: 100, slouch_seconds: 10, episode_count: 1 }
    args = { device: session.device, device_session_id: session.device_session_id, snapshot: snapshot,
      first_observed_at: session.first_observed_at, calendar_timezone: session.calendar_timezone }
    assert_equal :duplicate, Snapshots::Ingest.new(**args).call.disposition
    assert_equal 100, query.entries.first.tracked_seconds
    snapshot.merge!(sequence: 2, tracked_seconds: 200, slouch_seconds: 20)
    Snapshots::Ingest.new(**args).call
    assert_equal 200, query.entries.first.tracked_seconds
    assert_equal Rational(1, 10), query.entries.first.ratio
  end

  private

  def query
    WeeklyCompetitionQuery.new(group: @group, now: @now).call
  end

  def record(user, tracked:, slouch:, observed: @now, personal_zone: "America/New_York")
    device = user.devices.first || Device.provision!(device_id: SecureRandom.hex(16), user: user)
    Snapshots::Ingest.new(device: device, device_session_id: device.posture_sessions.count + 1,
      snapshot: { protocol_version: 1, state: "upright", sequence: 1, tracked_seconds: tracked, slouch_seconds: slouch, episode_count: 1 },
      first_observed_at: observed, calendar_timezone: personal_zone).call.session
  end
end
