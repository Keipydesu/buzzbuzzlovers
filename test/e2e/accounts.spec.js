const { test, expect, password, login, logout, signup, noOverflow } = require('./support/helpers');

test('public introduction, keyboard entry, themes and account navigation', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Notice your posture. Build better habits, together.');
  await expect(page.getByText(/Wearable pairing is coming soon/)).toBeVisible();
  await expect(page.locator('form')).toHaveCount(0);
  await page.keyboard.press(info.project.use.defaultBrowserType === 'webkit' ? 'Alt+Tab' : 'Tab');
  await expect(page.getByRole('link', { name: 'Skip to introduction' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#welcome$/);
  await noOverflow(page);
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(page.locator('.tracker')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('link', { name: 'Create your account', exact: true }).click();
  await expect(page.locator('.tracker')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByLabel('Username', { exact: true })).toHaveAttribute('aria-describedby', 'username-hint');
  await noOverflow(page);
  await info.attach('signup-light.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await page.reload();
  await expect(page.locator('.tracker')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('link', { name: 'Log in', exact: true }).click();
  await noOverflow(page);
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('autocomplete', 'current-password');
});

test('signup through landing, empty dashboard, logout and normalized login', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Create your account', exact: true }).click();
  await signup(page, 'New_Friend');
  await expect(page).toHaveURL('/');
  await expect(page.getByText('No saved activity today.')).toBeVisible();
  await expect(page.locator('.personal-history tbody tr')).toHaveCount(7);
  await expect(page.locator('.saved-week-missing')).toHaveCount(7);
  await logout(page);
  await expect(page).toHaveURL('/login');
  await page.goto('/');
  await expect(page.locator('.landing-page')).toBeVisible();
  await login(page, ' NEW_FRIEND ');
  await expect(page).toHaveURL('/');
});

test('signup errors, duplicate username and login failure remain actionable', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Username', { exact: true }).fill('newfriend');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill('different password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText("doesn't match");
  await page.getByLabel('Username', { exact: true }).fill('alice');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('already been taken');
  await noOverflow(page);
  await page.goto('/login');
  await page.getByLabel('Username', { exact: true }).fill('alice');
  await page.getByLabel('Password', { exact: true }).fill('wrong password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Username or password is incorrect.');
  await login(page);
});

test('anonymous and logged-out private routes and API stay protected; CSRF is real', async ({ page }) => {
  for (const path of ['/groups', '/coach', '/wearable']) {
    await page.goto(path);
    await expect(page).toHaveURL('/login');
  }
  expect((await page.request.get('/api/v1/today')).status()).toBe(401);
  const rejected = await page.request.post('/signup', { form: { 'user[username]': 'forged', 'user[password]': password, 'user[password_confirmation]': password } });
  expect(rejected.status()).toBe(422);
  await login(page);
  expect((await page.request.post('/groups', { form: { 'group[name]': 'Forged group' } })).status()).toBe(422);
  await logout(page);
  await expect(page).toHaveURL('/login');
  await page.goto('/groups');
  await expect(page).toHaveURL('/login');
  for (const path of ['/api/v1/devices', '/api/v1/today', '/api/v1/weekly']) {
    const response = await page.request.get(path);
    expect(response.status()).toBe(401);
    expect(response.headers()['cache-control']).toBe('no-store');
  }
});

test('signup enforces browser password length and reports invalid username with a recovery path', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Username', { exact: true }).fill('bad-name');
  await page.getByLabel('Password', { exact: true }).fill('short');
  await page.getByLabel('Confirm password', { exact: true }).fill('short');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  expect(await page.getByLabel('Password', { exact: true }).evaluate(input => input.validity.tooShort)).toBe(true);
  await expect(page).toHaveURL('/signup');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Username is invalid');
  await signup(page, 'recovered_user');
  await expect(page.getByText('No saved activity today.')).toBeVisible();
});

test('hovering navigation does not start background requests that can restore a logged-out session', async ({ page }) => {
  await login(page);
  await page.goto('/groups');
  await page.clock.install();
  const prefetches = [];
  page.on('request', request => {
    if (request.headers()['x-sec-purpose'] === 'prefetch') prefetches.push(request.url());
  });
  await page.getByRole('link', { name: 'bbl.', exact: true }).hover();
  // Advance the browser's actual prefetch timer; no wall-clock sleep or retry.
  await page.clock.runFor(1000);
  expect(prefetches).toEqual([]);
  await logout(page);
  expect((await page.request.get('/api/v1/today')).status()).toBe(401);
  await page.goto('/');
  await expect(page.locator('.landing-page')).toBeVisible();
});
