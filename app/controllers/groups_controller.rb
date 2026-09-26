class GroupsController < ApplicationController
  def index
    @groups = current_user.groups.order(:name)
    @group = Group.new
  end

  def create
    @group = Group.start!(name: params.expect(group: [ :name ])[:name], creator: current_user)
    redirect_to group_path(@group), status: :see_other
  rescue ActiveRecord::RecordInvalid => error
    @group = error.record
    @groups = current_user.groups.order(:name)
    render :index, status: :unprocessable_entity
  end

  def show
    @group = current_user.groups.find(params[:id])
    @competition = WeeklyCompetitionQuery.new(group: @group).call
  end

  def leave
    membership = current_user.group_memberships.find_by!(group_id: params[:id])
    membership.destroy!
    redirect_to groups_path, status: :see_other
  end
end
