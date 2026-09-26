module Authentication
  extend ActiveSupport::Concern

  included do
    helper_method :current_user
    before_action :require_authentication
  end

  private

  def current_user
    return @current_user if defined?(@current_user)

    @current_user = if session[:signed_in_at].is_a?(Integer) && session[:signed_in_at] > 2.weeks.ago.to_i
      User.find_by(id: session[:user_id])
    end
  end

  def require_authentication
    redirect_to login_path unless current_user
  end

  def after_login_path
    code = session.delete(:invitation_code)
    code.present? ? group_invitation_path(code: code) : root_path
  end

  def start_session(user)
    invitation_code = session[:invitation_code]
    reset_session
    session[:invitation_code] = invitation_code
    session[:user_id] = user.id
    session[:signed_in_at] = Time.current.to_i
    @current_user = user
  end
end
