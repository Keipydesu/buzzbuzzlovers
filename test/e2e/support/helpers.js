const { test: base, expect } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const { env } = require('./environment');
const password = 'browser test password';
function fixture(...args) {
  execFileSync('bin/rails', ['runner', 'test/e2e/support/fixtures.rb', ...args], { env, stdio: 'pipe' });
}
const test = base.extend({
  isolation: [async ({ context }, use) => {
    fixture('reset');
    const errors = [];
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.hostname === '127.0.0.1' ? route.continue() : route.abort();
    });
    await use();
    expect(errors, 'No uncaught browser errors').toEqual([]);
  }, { auto: true }],
});
async function login(page, username = 'alice') {
  if (!page.url().endsWith('/login')) await page.goto('/login');
  await expect(page.locator('html')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('html')).not.toHaveAttribute('data-turbo-preview', '');
  await expect(page.getByRole('navigation', { name: 'Account' })).toHaveCount(0);
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Account' })).toContainText(username.trim().toLowerCase());
}
async function signup(page, username) {
  await expect(page.locator('html')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('html')).not.toHaveAttribute('data-turbo-preview', '');
  await expect(page.getByRole('navigation', { name: 'Account' })).toHaveCount(0);
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Account' })).toContainText(username.trim().toLowerCase());
}
async function logout(page) {
  if (!(await page.getByRole('button', { name: 'Log out' }).isVisible())) {
    await page.getByLabel('Account menu', { exact: true }).click();
  }
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL('/login');
  await expect(page.getByRole('navigation', { name: 'Account' })).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('html')).not.toHaveAttribute('data-turbo-preview', '');
}
async function createGroup(page, name = 'Desk friends') {
  await page.goto('/groups');
  await page.getByLabel('Group name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Create group', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  return { path: new URL(page.url()).pathname, code: (await page.locator('.invite-code').innerText()).trim() };
}
async function csrf(page) { return page.locator('meta[name="csrf-token"]').getAttribute('content'); }
async function upload(page, { device = 1, session = 1, sequence = 1, tracked = 600, slouch = 60, episodes = 1, state = 'upright', observed = '2026-09-23T15:00:00Z' } = {}) {
  return page.request.put(`/api/v1/devices/${device.toString(16).padStart(32, '0')}/sessions/${session}/snapshot`, {
    headers: { 'X-CSRF-Token': await csrf(page) },
    data: { snapshot: { protocol_version: 1, state, sequence, tracked_seconds: tracked, slouch_seconds: slouch, episode_count: episodes }, observation: { first_observed_at: observed } },
  });
}
async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Page fits viewport').toBe(true);
}
module.exports = { test, expect, fixture, password, login, logout, signup, createGroup, csrf, upload, noOverflow };
