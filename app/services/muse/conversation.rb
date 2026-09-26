module Muse
  # In-process, per-user conversation memory so /coach holds a real back-
  # and-forth instead of restarting on every question. Deliberately not
  # Rails.cache: the test environment's :null_store would make conversation
  # continuity untestable, and production's Solid Cache would persist this
  # past the local/dev-and-test scope CoachController restricts it to. Also
  # deliberately not the session cookie: a single exchange (a 2,000-character
  # question plus a ~1,200-token answer) can already approach the ~4KB cookie
  # limit. Single-process, in-memory only — matches this feature's existing
  # local-only, dev-and-test-only gate (see CoachController).
  class Conversation
    MAX_EXCHANGES = 6
    EXPIRES_IN = 30.minutes

    STORE = ActiveSupport::Cache::MemoryStore.new(size: 8.megabytes)
    private_constant :STORE

    def self.for(key)
      STORE.read(cache_key(key)) || []
    end

    def self.append!(key, role:, content:)
      turns = (self.for(key) + [ { role: role, content: content } ]).last(MAX_EXCHANGES * 2)
      STORE.write(cache_key(key), turns, expires_in: EXPIRES_IN)
      turns
    end

    def self.reset!(key)
      STORE.delete(cache_key(key))
    end

    def self.cache_key(key)
      "muse_conversation:#{key}"
    end
  end
end
