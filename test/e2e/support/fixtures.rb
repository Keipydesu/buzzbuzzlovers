require_relative "guard"
E2eGuard.check!
case ARGV.fetch(0)
when "reset"
  [ PostureSnapshot, PostureSession, Device, GroupInvitation, GroupMembership, Group, User ].each(&:delete_all)
  %w[alice bob carol dana outsider].each_with_index do |name, index|
    user = User.create!(username: name, password: "browser test password")
    Device.provision!(device_id: (index + 1).to_s(16).rjust(32, "0"), user: user)
  end
  File.write(Rails.root.join("tmp/e2e-coach-mode"), "unavailable")
when "coach"
  mode = ARGV.fetch(1)
  abort "Unknown coach mode" unless %w[available unavailable].include?(mode)
  File.write(Rails.root.join("tmp/e2e-coach-mode"), mode)
else
  abort "Unknown fixture operation"
end
