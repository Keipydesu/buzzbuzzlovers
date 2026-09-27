require "digest"
require "securerandom"

module DemoFriendGroup
  CODE = "POSEFRIENDS1".freeze
  NAME = "Slouch boys".freeze
  MEMBERS = [ [ "ava", 5, 8 ], [ "ben", 10, 15 ], [ "cam", 15, 16 ] ].freeze

  def self.seed!
    raise "Demo seeds require development or test" unless Rails.env.development? || Rails.env.test?
    connection = ActiveRecord::Base.connection
    host = connection.raw_connection.host
    raise "Demo seeds require local PostgreSQL" unless host.start_with?("/") || %w[localhost 127.0.0.1 ::1].include?(host)

    timezone = Rails.application.config.x.demo_timezone
    today = Time.current.in_time_zone(timezone).to_date
    Group.transaction do
      users = MEMBERS.map do |username, _current, _previous|
        User.find_or_create_by!(username: username) { |user| user.password = SecureRandom.base64(32) }
      end
      invitation = GroupInvitation.find_by(code: CODE)
      group = invitation&.group
      if group
        raise "Demo invite code is already in use" unless group.name == NAME && group.created_by_user_id == users.first.id
      else
        group = Group.create!(name: NAME, created_by_user: users.first)
        group.create_group_invitation!(code: CODE)
      end
      users.zip(MEMBERS).each do |user, (_username, current, previous)|
        group.group_memberships.find_or_create_by!(user: user)
        device = Device.provision!(device_id: Digest::SHA256.hexdigest("pose-demo/pose_demo_#{user.username}")[0, 32], user: user)
        [ [ today, current ], [ today - 7, previous ] ].each do |date, percent|
          result = Snapshots::Ingest.new(
            device: device, device_session_id: date.strftime("%Y%m%d").to_i,
            snapshot: { protocol_version: 1, sequence: 1, state: "ended", tracked_seconds: 3600, slouch_seconds: 36 * percent, episode_count: percent },
            first_observed_at: date.in_time_zone(timezone), calendar_timezone: timezone
          ).call
          raise "Demo snapshot conflict: #{result.error_code}" unless %i[accepted duplicate].include?(result.disposition)
        end
      end
      group
    end
  end
end
