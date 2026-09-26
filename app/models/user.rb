class User < ApplicationRecord
  has_many :group_memberships, dependent: :destroy
  has_many :groups, through: :group_memberships
  has_secure_password
  normalizes :username, with: ->(value) { value.strip.downcase }
  has_many :devices, dependent: :restrict_with_error
  has_many :posture_sessions, dependent: :restrict_with_error

  validates :username, format: { with: /\A[a-z0-9_]{3,24}\z/ }, uniqueness: { case_sensitive: false }
  validates :password, length: { minimum: 12 }, allow_nil: true
end
