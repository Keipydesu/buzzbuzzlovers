class DashboardController < ActionController::Base
  protect_from_forgery with: :exception
  before_action { response.headers["Cache-Control"] = "no-store" }
  before_action :check_body, only: [:snapshot, :seed, :reset]
  rescue_from DemoSession::Invalid, with: ->(e) { render json: {error: e.message}, status: 422 }
  rescue_from DemoSession::Conflict, with: ->(e) { render json: {error: e.message}, status: 409 }

  def index; end
  def data
    render json: DemoSession.dashboard
  end
  def snapshot
    disposition, row = DemoSession.ingest(params[:id], JSON.parse(request.raw_post))
    render json: {disposition: disposition, session: row}
  rescue JSON::ParserError
    render json: {error: "Malformed JSON"}, status: 400
  end
  def seed
    DemoSession.transaction do
      [28, 35, 0, 42, 24, 38].each_with_index do |minutes, i|
        next if minutes.zero?
        day = Date.current - (6 - i)
        id = 100 + day.jd
        next if DemoSession.exists?(id: id)
        DemoSession.ingest(id, {"snapshot" => {"protocol_version" => 1, "state" => "ended", "sequence" => 100,
          "tracked_seconds" => minutes * 60, "slouch_seconds" => [300, 240, 0, 180, 120, 90][i], "episode_count" => [5, 4, 0, 3, 2, 2][i]},
          "first_observed_at" => Time.zone.local(day.year, day.month, day.day, 12).iso8601})
      end
    end
    render json: DemoSession.dashboard
  end
  def reset
    DemoSession.delete_all
    render json: DemoSession.dashboard
  end
  private
  def check_body
    if request.content_length.to_i > 8192 || request.raw_post.bytesize > 8192
      render json: {error: "Request too large"}, status: 413
    elsif request.media_type != "application/json"
      render json: {error: "JSON required"}, status: 415
    end
  end
end
