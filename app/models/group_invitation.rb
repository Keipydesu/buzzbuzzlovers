class GroupInvitation < ApplicationRecord
  belongs_to :group
  before_validation :generate_code, on: :create
  validates :code, format: { with: /\A[A-Z0-9]{12}\z/ }

  def self.normalize_code(value)
    value.is_a?(String) ? value.strip.upcase : ""
  end

  def join!(user)
    group.group_memberships.create_or_find_by!(user: user)
  end

  private

  def generate_code
    self.code ||= SecureRandom.alphanumeric(12).upcase
  end
end
