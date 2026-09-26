class CreateDevices < ActiveRecord::Migration[8.1]
  def change
    create_table :devices, id: :string, limit: 32 do |t|
      t.datetime :first_seen_at, null: false
      t.datetime :last_seen_at, null: false

      t.timestamps
    end

    add_check_constraint :devices,
      "id ~ '^[0-9a-f]{32}$'",
      name: "devices_id_is_lowercase_hex32"
  end
end
