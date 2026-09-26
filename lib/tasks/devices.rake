namespace :devices do
  desc "Bind a wearable to a user: bin/rails 'devices:provision[hex_device_id,username]'"
  task :provision, [ :device_id, :username ] => :environment do |_, args|
    user = User.find_by!(username: args.fetch(:username).strip.downcase)
    device = Device.provision!(device_id: args.fetch(:device_id), user: user)
    puts "Device #{device.id} bound to #{user.username}"
  end
end
