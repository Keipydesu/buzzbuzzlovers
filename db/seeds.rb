# Synthetic friend-group data for local development. Production has no required
# seed records. POSE_DEMO_SEED=0 keeps development empty; tests opt in.

if ENV.fetch("POSE_DEMO_SEED", Rails.env.development? ? "1" : "0") == "1"
  require Rails.root.join("lib/demo_friend_group")
  group = DemoFriendGroup.seed!
  puts "Synthetic demo group: #{group.name}"
  puts "Create your own account, then join at /groups/join/#{group.group_invitation.code}"
else
  puts "Demo seed skipped (enable locally with POSE_DEMO_SEED=1)."
end
