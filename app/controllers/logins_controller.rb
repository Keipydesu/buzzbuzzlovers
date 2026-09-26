class LoginsController < ApplicationController
  skip_before_action :require_authentication, only: %i[new create]
  rate_limit to: 10, within: 3.minutes, only: :create,
    with: -> { render plain: "Too many login attempts. Try again in a few minutes.", status: :too_many_requests }

  def new
  end

  def create
    username = params[:username]
    password = params[:password]
    user = User.authenticate_by(username: username.strip.downcase, password: password) if username.is_a?(String) && password.is_a?(String)
    if user
      start_session(user)
      redirect_to after_login_path, status: :see_other
    else
      flash.now[:alert] = "Username or password is incorrect."
      render :new, status: :unprocessable_entity
    end
  end

  def destroy
    reset_session
    redirect_to login_path, status: :see_other
  end
end
