require "test_helper"
require Rails.root.join("lib/demo_friend_group")

class DemoFriendGroupTest < ActiveSupport::TestCase
  test "demo seed is idempotent and preserves canonical and history totals" do
    travel_to Time.zone.parse("2026-09-26 16:00:00") do
      group = DemoFriendGroup.seed!
      assert_equal "POSEFRIENDS1", group.group_invitation.code
      assert_equal %w[ava ben cam], group.users.order(:username).pluck(:username)
      assert_equal [ 5, 10, 15 ], WeeklyCompetitionQuery.new(group: group).call.entries.map { |entry| (entry.ratio * 100).to_i }
      counts = [ User.count, Group.count, GroupMembership.count, Device.count, PostureSession.count, PostureSnapshot.count ]
      assert_equal group.id, DemoFriendGroup.seed!.id
      assert_equal counts, [ User.count, Group.count, GroupMembership.count, Device.count, PostureSession.count, PostureSnapshot.count ]
    end
  end
end
