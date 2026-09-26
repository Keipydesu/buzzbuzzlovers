class GroupsController < ApplicationController
  def show
    # UI-only group creation; no account, membership, or invitation is persisted.
    @new_group = params[:name].is_a?(String) && params[:name].strip.present?
    @group_name = @new_group ? params[:name].strip.first(40) : "Study group"
    @members = if @new_group
      [ [ nil, "You", nil, "Not ranked yet" ] ]
    else
      [ [ 1, "Alex", 8.2, "4 days tracked" ], [ 2, "Jordan", 10.1, "5 days tracked" ],
        [ 3, "You", 12.5, "6 days tracked" ], [ 4, "Sam", 14.4, "3 days tracked" ],
        [ nil, "Casey", nil, "1 more day to qualify" ] ]
    end
  end
end
