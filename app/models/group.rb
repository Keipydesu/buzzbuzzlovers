class Group < ApplicationRecord
  belongs_to :created_by_user, class_name: "User"
  has_many :group_memberships, dependent: :destroy
  has_many :users, through: :group_memberships
  has_one :group_invitation, dependent: :destroy
  normalizes :name, with: ->(value) { value.strip }
  validates :name, presence: true, length: { maximum: 40 }

  def self.start!(name:, creator:)
    transaction do
      group = create!(name: name, created_by_user: creator)
      group.group_memberships.create!(user: creator)
      group.create_group_invitation!
      group
    end
  end
end
