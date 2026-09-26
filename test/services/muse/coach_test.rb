require "test_helper"

class Muse::CoachTest < ActiveSupport::TestCase
  test "DNS failure becomes Unavailable without exposing the hostname" do
    http = Net::HTTP.new("example.invalid", 443)
    with_method_replaced(Muse::Coach, :configured?, -> { true }) do
      with_method_replaced(ENV, :fetch, ->(*) { "test-placeholder" }) do
        with_method_replaced(Net::HTTP, :new, ->(*) { http }) do
          with_method_replaced(http, :request, ->(*) { raise SocketError, "secret-host lookup failed" }) do
            error = assert_raises(Muse::Coach::Unavailable) { Muse::Coach.new.call("Desk setup?") }
            assert_equal "Muse could not respond right now. Please try again later.", error.message
          end
        end
      end
    end
  end

  test "a later call includes prior turns and a tracked-data summary, and stays a real conversation" do
    user = User.create!(username: "muse_context_user", password: "a" * 12)
    device = Device.provision!(device_id: "00112233445566778899aabbccddeeff", user: user)
    now = Time.current
    PostureSession.create!(
      device: device, device_session_id: 1, protocol_version: 1, last_sequence: 1,
      state: "upright", tracked_seconds: 600, slouch_seconds: 60, episode_count: 3,
      first_received_at: now, last_received_at: now, first_observed_at: now,
      calendar_timezone: "America/New_York", calendar_day: now.to_date
    )

    captured_bodies = with_muse_stub([ "Try a footrest.", "Also raise your monitor a bit." ]) do
      Muse::Coach.new.call("What about my chair?", user: user)
      Muse::Coach.new.call("And my monitor?", user: user)
    end

    first_messages, second_messages = captured_bodies

    assert first_messages.any? { |m| m["content"].include?("10.0 min tracked") }
    assert_equal({ "role" => "user", "content" => "What about my chair?" }, first_messages.last)

    assert_includes second_messages, { "role" => "user", "content" => "What about my chair?" }
    assert_includes second_messages, { "role" => "assistant", "content" => "Try a footrest." }
    assert_equal({ "role" => "user", "content" => "And my monitor?" }, second_messages.last)
  ensure
    Muse::Coach.reset!(user)
  end

  test "with no user, no history or tracked-data summary is sent and nothing is stored" do
    captured_bodies = with_muse_stub([ "General advice." ]) do
      Muse::Coach.new.call("General question?")
    end

    messages = captured_bodies.first
    assert_equal 2, messages.size
    assert_equal "developer", messages.first["role"]
    assert_equal({ "role" => "user", "content" => "General question?" }, messages.last)
  end

  private

  # Stubs configured?/ENV.fetch/Net::HTTP for the duration of the block,
  # returning the parsed `messages` array sent to Net::HTTP#request on each
  # call, in order, and replying with `answers` in order.
  def with_muse_stub(answers)
    captured_bodies = []
    call_count = 0
    http = Net::HTTP.new("example.invalid", 443)

    with_method_replaced(Muse::Coach, :configured?, -> { true }) do
      with_method_replaced(ENV, :fetch, ->(*) { "test-placeholder" }) do
        with_method_replaced(Net::HTTP, :new, ->(*) { http }) do
          with_method_replaced(http, :request, lambda { |request|
            captured_bodies << JSON.parse(request.body)["messages"]
            answer = answers[call_count]
            call_count += 1
            response = Net::HTTPOK.new("1.1", "200", "OK")
            response.define_singleton_method(:body) { JSON.generate(choices: [ { message: { content: answer } } ]) }
            response
          }) do
            yield
          end
        end
      end
    end

    captured_bodies
  end
end
