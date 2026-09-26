require "test_helper"

class CoachTest < ActionDispatch::IntegrationTest
  setup { sign_in }

  test "unavailable adapter produces a friendly 503" do
    adapter = Object.new
    def adapter.call(*)
      raise Muse::Coach::Unavailable, "Muse could not respond right now. Please try again later."
    end
    with_method_replaced(Muse::Coach, :new, -> { adapter }) do
      post coach_path, params: { question: "How can I adjust my desk?" }
    end
    assert_response :service_unavailable
    assert_includes response.body, "Muse could not respond right now. Please try again later."
  end
end
