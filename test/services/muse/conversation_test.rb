require "test_helper"
require "timeout"

class Muse::ConversationTest < ActiveSupport::TestCase
  setup { @key = "conversation-test-#{SecureRandom.uuid}" }
  teardown { Muse::Conversation.reset!(@key) }

  test "concurrent exchanges each see complete preceding exchanges" do
    started = Queue.new
    finish = Queue.new
    first = Thread.new do
      Muse::Conversation.exchange(@key, question: "first") do |history|
        started << history
        finish.pop
        "first answer"
      end
    end
    assert_equal [], Timeout.timeout(5) { started.pop }
    second = Thread.new do
      Muse::Conversation.exchange(@key, question: "second") do |history|
        history.map { |turn| turn[:content] }.join(" / ")
      end
    end
    # Readers cannot see an unanswered question while the provider is pending.
    assert_empty Muse::Conversation.for(@key)
    finish << true
    Timeout.timeout(5) { [ first, second ].each(&:value) }
    assert_equal [ "first", "first answer", "second", "first / first answer" ],
      Muse::Conversation.for(@key).map { |turn| turn[:content] }
  ensure
    [ first, second ].compact.each { |thread| thread.kill if thread.alive? }
  end

  test "reset discards a pending response and permits a fresh conversation" do
    started = Queue.new
    finish = Queue.new
    pending = Thread.new do
      Muse::Conversation.exchange(@key, question: "old question") do
        started << true
        finish.pop
        "old answer"
      end
    rescue Muse::Conversation::Changed
      :discarded
    end
    Timeout.timeout(5) { started.pop }
    Muse::Conversation.reset!(@key)
    assert_empty Muse::Conversation.for(@key)
    finish << true
    assert_equal :discarded, Timeout.timeout(5) { pending.value }
    assert_empty Muse::Conversation.for(@key)
    Muse::Conversation.exchange(@key, question: "new question") do |history|
      assert_empty history
      "new answer"
    end
    assert_equal [ "new question", "new answer" ], Muse::Conversation.for(@key).map { |turn| turn[:content] }
  ensure
    pending.kill if pending&.alive?
  end

  test "failed requests preserve history and retention keeps complete exchanges" do
    7.times do |index|
      Muse::Conversation.exchange(@key, question: "question #{index}") { "answer #{index}" }
    end
    history = Muse::Conversation.for(@key)
    assert_equal 12, history.size
    assert_equal "question 1", history.first[:content]
    assert_equal [ "user", "assistant" ] * 6, history.map { |turn| turn[:role] }
    assert_raises(Muse::Coach::Unavailable) do
      Muse::Conversation.exchange(@key, question: "failed") { raise Muse::Coach::Unavailable }
    end
    assert_equal history, Muse::Conversation.for(@key)
    assert_empty Muse::Conversation.for("#{@key}-another-user")
  end
end
