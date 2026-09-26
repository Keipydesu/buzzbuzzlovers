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
end
