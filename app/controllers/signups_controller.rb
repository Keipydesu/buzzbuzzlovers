class SignupsController < ApplicationController
  skip_before_action :require_authentication
  rate_limit to: 5, within: 3.minutes, only: :create,
    with: -> { render plain: "Too many signup attempts. Try again in a few minutes.", status: :too_many_requests }

  def new
    @user = User.new
  end

  def create
    @user = User.new(params.expect(user: [ :username, :password, :password_confirmation ]))
    if @user.save
      start_session(@user)
      redirect_to after_login_path, status: :see_other
    else
      render :new, status: :unprocessable_entity
    end
  rescue ActiveRecord::RecordNotUnique
    @user.errors.add(:username, "has already been taken")
    render :new, status: :unprocessable_entity
  end
end
