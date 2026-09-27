require "test_helper"

class DeviceClaimRaceTest < ActiveSupport::TestCase
  self.use_transactional_tests = false

  test "concurrent first claims leave one immutable owner" do
    device_id = SecureRandom.hex(16)
    users = 2.times.map { User.create!(username: "race_#{SecureRandom.hex(6)}", password: "test password long") }
    ready = Queue.new
    start = Queue.new
    results = Queue.new
    threads = users.map do |user|
      Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do
          ready << true
          start.pop
          begin
            results << [ :claimed, Device.provision!(device_id: device_id, user: user).user_id ]
          rescue Device::OwnershipUnavailable
            results << [ :unavailable, user.id ]
          rescue StandardError => error
            results << [ :error, error ]
          end
        end
      end
    end
    2.times { ready.pop }
    2.times { start << true }
    threads.each(&:join)
    outcomes = 2.times.map { results.pop }
    assert_equal [ :claimed, :unavailable ], outcomes.map(&:first).sort
    winner = outcomes.find { |result| result.first == :claimed }.last
    assert_equal winner, Device.find(device_id).user_id
    assert_equal 1, Device.where(id: device_id).count
  ensure
    threads&.each(&:join)
    Device.where(id: device_id).delete_all if device_id
    User.where(id: users.map(&:id)).delete_all if users
  end
end
