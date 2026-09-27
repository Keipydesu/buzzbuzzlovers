require "securerandom"

module Muse
  # Local, single-process memory only. Bounded lock stripes avoid retaining a
  # mutex for every user forever; collisions only serialize unrelated requests.
  class Conversation
    class Changed < StandardError; end
    MAX_EXCHANGES = 6
    EXPIRES_IN = 30.minutes
    STORE = ActiveSupport::Cache::MemoryStore.new(size: 8.megabytes)
    STORE_LOCK = Mutex.new
    REQUEST_LOCKS = Array.new(64) { Mutex.new }.freeze
    private_constant :STORE, :STORE_LOCK, :REQUEST_LOCKS

    def self.for(key)
      STORE_LOCK.synchronize { STORE.read(cache_key(key))&.fetch(:turns) || [] }
    end

    # Serialize provider calls so each question sees the preceding complete
    # exchange. Never hold STORE_LOCK across network I/O: reset stays immediate.
    def self.exchange(key, question:)
      REQUEST_LOCKS[key.hash % REQUEST_LOCKS.size].synchronize do
        entry = STORE_LOCK.synchronize do
          STORE.fetch(cache_key(key), expires_in: EXPIRES_IN) do
            { token: SecureRandom.uuid, turns: [] }
          end
        end
        answer = yield entry[:turns]
        STORE_LOCK.synchronize do
          current = STORE.read(cache_key(key))
          # Reset, expiry or eviction must not let an old answer resurrect history.
          raise Changed unless current && current[:token] == entry[:token]

          turns = (entry[:turns] + [
            { role: "user", content: question },
            { role: "assistant", content: answer }
          ]).last(MAX_EXCHANGES * 2)
          STORE.write(cache_key(key), { token: entry[:token], turns: turns }, expires_in: EXPIRES_IN)
        end
        answer
      end
    end

    def self.reset!(key)
      STORE_LOCK.synchronize { STORE.delete(cache_key(key)) }
    end

    def self.cache_key(key)
      "muse_conversation:#{key}"
    end
  end
end
