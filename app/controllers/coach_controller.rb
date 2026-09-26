class CoachController < ApplicationController
  before_action :keep_local_until_accounts_exist
  before_action { response.headers["Cache-Control"] = "no-store" }
  rate_limit to: 5, within: 1.minute, only: :create

  def show
  end

  def create
    @question = params[:question]
    unless @question.is_a?(String) && @question.strip.length.between?(1, 2000)
      @question = "" unless @question.is_a?(String)
      @error = "Ask a question between 1 and 2,000 characters."
      return render :show, status: :unprocessable_entity
    end

    @answer = Muse::Coach.new.call(@question.strip)
    render :show
  rescue Muse::Coach::Unavailable => error
    @error = error.message
    render :show, status: :service_unavailable
  end

  private

  def keep_local_until_accounts_exist
    head :not_found unless Rails.env.development? || Rails.env.test?
  end
end
