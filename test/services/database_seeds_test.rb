require "test_helper"

class DatabaseSeedsTest < ActiveSupport::TestCase
  setup do
    @previous_seed_setting = ENV["POSE_DEMO_SEED"]
    @previous_environment = Rails.env
  end

  teardown do
    ENV["POSE_DEMO_SEED"] = @previous_seed_setting
    Rails.env = @previous_environment
  end

  test "development seeds create a group and history without duplicates" do
    Rails.env = "development"
    ENV.delete("POSE_DEMO_SEED")

    assert_difference -> { PostureSession.count }, 6 do
      assert_difference -> { PostureSnapshot.count }, 6 do
        assert_difference -> { Group.count }, 1 do
          assert_output(/Synthetic demo group:/) { load Rails.root.join("db/seeds.rb") }
        end
      end
    end
    counts = seed_counts
    capture_io { load Rails.root.join("db/seeds.rb") }
    assert_equal counts, seed_counts
  end

  test "development can opt out and test and production skip by default" do
    counts = seed_counts
    [ [ "development", "0" ], [ "test", nil ], [ "production", nil ] ].each do |environment, setting|
      Rails.env = environment
      ENV["POSE_DEMO_SEED"] = setting
      assert_output(/Demo seed skipped/) { load Rails.root.join("db/seeds.rb") }
      assert_equal counts, seed_counts
    end
  end

  test "tests can explicitly enable demo seeds" do
    ENV["POSE_DEMO_SEED"] = "1"
    assert_difference -> { PostureSession.count }, 6 do
      capture_io { load Rails.root.join("db/seeds.rb") }
    end
  end

  test "production cannot opt into synthetic data" do
    Rails.env = "production"
    ENV["POSE_DEMO_SEED"] = "1"
    counts = seed_counts
    error = assert_raises(RuntimeError) { load Rails.root.join("db/seeds.rb") }
    assert_match(/require development or test/, error.message)
    assert_equal counts, seed_counts
  end

  private

  def seed_counts
    [ User, Group, GroupMembership, GroupInvitation, Device, PostureSession, PostureSnapshot ].map(&:count)
  end
end
