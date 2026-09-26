class GroupInvitationsController < ApplicationController
  skip_before_action :require_authentication, only: :show
  rate_limit to: 30, within: 3.minutes, only: %i[show create],
    with: -> { render plain: "Too many invitation attempts. Try again shortly.", status: :too_many_requests }

  def show
    @invitation = find_invitation!
    # Remember only the validated invitation, never an arbitrary redirect URL.
    session[:invitation_code] = @invitation.code unless current_user
  end

  def create
    invitation = find_invitation!
    invitation.join!(current_user)
    session.delete(:invitation_code)
    redirect_to group_path(invitation.group), status: :see_other
  end

  private

  def find_invitation!
    GroupInvitation.find_by!(code: GroupInvitation.normalize_code(params[:code]))
  end
end
