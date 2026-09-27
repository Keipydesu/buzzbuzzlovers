class CoachController < ApplicationController
  before_action :keep_local_until_accounts_exist
  before_action { response.headers["Cache-Control"] = "no-store" }
  rate_limit to: 5, within: 1.minute, only: :create

  def show
    @history = Muse::Conversation.for(current_user.id)
  end

  def create
    @question = params[:question]
    unless @question.is_a?(String) && @question.strip.length.between?(1, 2000)
      @question = "" unless @question.is_a?(String)
      @error = "Ask a question between 1 and 2,000 characters."
      @history = Muse::Conversation.for(current_user.id)
      return respond_with_error(:unprocessable_entity)
    end

    answer = Muse::Coach.new.call(@question.strip, user: current_user)
    respond_to do |format|
      format.json { render json: { answer: answer } }
      format.html { redirect_to coach_path, status: :see_other }
    end
  rescue Muse::Coach::Unavailable => error
    @error = error.message
    @history = Muse::Conversation.for(current_user.id)
    respond_with_error(:service_unavailable)
  end

  def reset
    Muse::Coach.reset!(current_user)
    respond_to do |format|
      format.json { render json: { reset: true } }
      format.html { redirect_to coach_path }
    end
  end

  private

  def respond_with_error(status)
    respond_to do |format|
      format.json { render json: { error: @error }, status: status }
      format.html { render :show, status: status }
    end
  end

  def keep_local_until_accounts_exist
    head :not_found unless Rails.env.development? || Rails.env.test?
  end
end
