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

  test "renders prior conversation turns and clears them on reset" do
    Muse::Conversation.append!(@test_user.id, role: "user", content: "Prior question")
    Muse::Conversation.append!(@test_user.id, role: "assistant", content: "Prior answer")

    get coach_path
    assert_includes response.body, "Prior question"
    assert_includes response.body, "Prior answer"

    delete coach_path
    assert_redirected_to coach_path

    get coach_path
    assert_not_includes response.body, "Prior question"
  ensure
    Muse::Conversation.reset!(@test_user.id)
  end
end
