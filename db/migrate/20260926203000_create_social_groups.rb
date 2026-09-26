class CreateSocialGroups < ActiveRecord::Migration[8.1]
  def change
    create_table :groups do |t|
      t.string :name, null: false
      t.references :created_by_user, null: false, foreign_key: { to_table: :users }
      t.timestamps
    end
    create_table :group_memberships do |t|
      t.references :group, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.timestamps
    end
    add_index :group_memberships, [ :group_id, :user_id ], unique: true
    create_table :group_invitations do |t|
      t.references :group, null: false, foreign_key: true, index: { unique: true }
      t.string :code, null: false
      t.timestamps
    end
    add_index :group_invitations, :code, unique: true
  end
end
