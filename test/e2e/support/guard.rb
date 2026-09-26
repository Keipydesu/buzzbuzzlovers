module E2eGuard
  def self.check!
    config = ActiveRecord::Base.connection_db_config.configuration_hash
    unless Rails.env.test? && ENV["BBL_E2E"] == "1" &&
        config[:host] == "127.0.0.1" && config[:database] == "bbl_playwright_test" &&
        ActiveRecord::Base.connection.select_value("SELECT current_database()") == "bbl_playwright_test"
      abort "E2E requires the dedicated loopback bbl_playwright_test database"
    end
  end
end
