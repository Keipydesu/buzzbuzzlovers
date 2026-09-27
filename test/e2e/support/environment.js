const env = {};
for (const key of ['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'TMPDIR', 'GEM_HOME', 'GEM_PATH', 'BUNDLE_PATH']) {
  if (process.env[key]) env[key] = process.env[key];
}
Object.assign(env, {
  SKIP_DOTENV: '1', RAILS_ENV: 'test', BBL_E2E: '1',
  DATABASE_URL: 'postgresql://127.0.0.1:5432/bbl_playwright_test',
  DEMO_TIMEZONE: 'America/New_York', SECRET_KEY_BASE: 'e2e-only-not-a-real-secret-'.repeat(4),
});
module.exports = { env };
