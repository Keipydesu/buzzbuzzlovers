module Middleware
  class ApiBodyLimit
    MAX_BODY_BYTES = 8192
    MUTATING_METHODS = %w[POST PUT PATCH].freeze

    def initialize(app)
      @app = app
    end

    def call(env)
      if env["PATH_INFO"].to_s.start_with?("/api/v1/") && MUTATING_METHODS.include?(env["REQUEST_METHOD"])
        return oversized_response if env["CONTENT_LENGTH"].to_i > MAX_BODY_BYTES

        # Run before Rails instrumentation and CSRF can decode parameters.
        # Do not use Request#content_length: it reads chunked bodies in full.
        stream = env["rack.input"]
        body = stream ? stream.read(MAX_BODY_BYTES + 1).to_s : ""
        stream&.rewind
        return oversized_response if body.bytesize > MAX_BODY_BYTES

        env["RAW_POST_DATA"] = body
        # Rails skips JSON parsing when Content-Length is absent/zero.
        env["CONTENT_LENGTH"] = body.bytesize.to_s
      end
      @app.call(env)
    end

    private

    def oversized_response
      body = JSON.generate(error: { code: "payload_too_large", message: "Request body exceeds #{MAX_BODY_BYTES} bytes" })
      [ 413, { "content-type" => "application/json", "cache-control" => "no-store", "content-length" => body.bytesize.to_s }, [ body ] ]
    end
  end
end
