class AddAccountsAndOwnership < ActiveRecord::Migration[8.1]
  def change
    create_table :users do |t|
      t.string :username, null: false
      t.string :password_digest, null: false
      t.timestamps
    end
    add_index :users, "lower(username)", unique: true, name: "index_users_on_normalized_username"
    add_check_constraint :users, "username ~ '^[a-z0-9_]{3,24}$'", name: "users_username_format"
    # Existing demo history remains unowned; never infer an account for it.
    add_reference :devices, :user, foreign_key: true
    add_reference :posture_sessions, :user, foreign_key: true
  end
end
