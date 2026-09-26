require "test_helper"

class GroupsTest < ActionDispatch::IntegrationTest
  setup { sign_in }

  test "create persists creator membership and one reusable invitation" do
    assert_difference [ "Group.count", "GroupMembership.count", "GroupInvitation.count" ], 1 do
      post groups_path, params: { group: { name: " Study friends " } }
    end
    group = Group.last
    assert_equal "Study friends", group.name
    assert_equal [ @test_user ], group.users.to_a
    assert_redirected_to group_path(group)
    follow_redirect!
    assert_response :ok
    assert_includes response.body, group.group_invitation.code
    assert_includes response.body, "Unranked"
    get root_path
    assert_response :ok
    assert_includes response.body, "Study friends"
  end

  test "invalid names do not leave partial groups" do
    assert_no_difference [ "Group.count", "GroupMembership.count", "GroupInvitation.count" ] do
      post groups_path, params: { group: { name: " " } }
    end
    assert_response :unprocessable_entity
  end

  test "link GET never joins and code POST joins immediately and idempotently" do
    group = Group.start!(name: "Crew", creator: @test_user)
    code = group.group_invitation.code
    other = User.create!(username: "other", password: "test password long")
    sign_in(other)
    assert_no_difference "GroupMembership.count" do
      get group_invitation_path(code: code)
      assert_response :ok
    end
    assert_difference "GroupMembership.count", 1 do
      post join_group_path, params: { code: " #{code.downcase} " }
      assert_redirected_to group_path(group)
    end
    assert_no_difference "GroupMembership.count" do
      post join_group_path, params: { code: code }
    end
    delete leave_group_path(group)
    assert_redirected_to groups_path
    get group_path(group)
    assert_response :not_found
  end

  test "nonmembers cannot see leaderboard or invite and cannot leave another membership" do
    owner = @test_user
    group = Group.start!(name: "Private crew", creator: owner)
    sign_in(User.create!(username: "outsider", password: "test password long"))
    get group_path(group)
    assert_response :not_found
    get groups_path
    assert_not_includes response.body, "Private crew"
    assert_no_difference "GroupMembership.count" do
      delete leave_group_path(group)
      assert_response :not_found
      post join_group_path, params: { code: "NOTAVALIDONE" }
      assert_response :not_found
    end
  end

  test "an anonymous invitation survives signup but never autojoins" do
    group = Group.start!(name: "Crew", creator: @test_user)
    code = group.group_invitation.code
    delete logout_path
    assert_no_difference "GroupMembership.count" do
      get group_invitation_path(code: code)
      assert_response :ok
      get signup_path
      assert_response :ok
      post signup_path, params: { user: { username: "newfriend", password: "test password long", password_confirmation: "test password long" } }
      assert_redirected_to group_invitation_path(code: code)
      follow_redirect!
      assert_response :ok
    end
    post join_group_path, params: { code: code }
    assert_redirected_to group_path(group)
  end

  test "membership mutations require CSRF tokens" do
    group = Group.start!(name: "Crew", creator: @test_user)
    sign_in(User.create!(username: "friend", password: "test password long"))
    previous = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true
    assert_no_difference "GroupMembership.count" do
      post join_group_path, params: { code: group.group_invitation.code }
      assert_response :unprocessable_entity
    end
    get group_invitation_path(code: group.group_invitation.code)
    token = Nokogiri::HTML(response.body).at_css('meta[name="csrf-token"]')["content"]
    post join_group_path, params: { code: group.group_invitation.code }, headers: { "X-CSRF-Token" => token }
    assert_redirected_to group_path(group)
  ensure
    ActionController::Base.allow_forgery_protection = previous
  end
end
