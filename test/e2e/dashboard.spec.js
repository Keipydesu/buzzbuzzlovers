const { test, expect, login, upload, noOverflow } = require('./support/helpers');

test('weekly chart uses saved days, distinguishes zero and missing, and averages only recorded days', async ({ page }, info) => {
  await login(page);
  await expect(page.locator('.account-nav')).toHaveCount(0);
  await expect(page.locator('.compact-header')).toHaveCount(1);
  await expect(page.locator('#today')).not.toContainText('first-seen');
  expect((await page.locator('.competition-hero').boundingBox()).y).toBeLessThan((await page.locator('#today').boundingBox()).y);
  await expect(page.locator('.saved-week-missing')).toHaveCount(7);
  await expect(page.locator('.saved-week-average')).toHaveCount(0);
  await expect(page.getByText('No saved activity in this period.')).toBeVisible();
  expect((await upload(page, { tracked: 1200, slouch: 300 })).ok()).toBe(true);
  expect((await upload(page, { session: 2, tracked: 600, slouch: 60, observed: '2026-09-21T15:00:00Z' })).ok()).toBe(true);
  expect((await upload(page, { session: 3, tracked: 0, slouch: 0, episodes: 0, observed: '2026-09-20T15:00:00Z' })).ok()).toBe(true);
  await page.reload();
  await expect(page.locator('.saved-week-missing')).toHaveCount(4);
  await expect(page.locator('.saved-week-zero')).toHaveCount(1);
  await expect(page.locator('.saved-week-bar')).toHaveCount(2);
  await expect(page.locator('.weekly-footnote')).toContainText('Average 10.0 min');
  await expect(page.locator('.saved-week-average')).toHaveAttribute('style', 'bottom: 50.0%');
  await expect(page.locator('.saved-week-column').last()).toHaveAttribute('aria-label', /20.0 minutes tracked, 5.0 minutes slouching/);
  await expect(page.locator('.weekly-data')).toHaveCount(0);
  await noOverflow(page);
  await info.attach('dashboard-dark.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(page.locator('.tracker')).toHaveCSS('color', 'rgb(5, 30, 57)');
  await noOverflow(page);
  await info.attach('dashboard-light.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
});

test('dashboard navigation keeps Bluetooth and uploads alive in the same tab', async ({ page, context }) => {
  await login(page);
  await page.goto('/wearable?ble_fixture=1');
  await page.getByRole('button', { name: 'Connect wearable', exact: true }).click();
  await page.evaluate(() => window.__bblFixture.emit({}));
  await expect(page.locator('[data-device-target="saving"]')).toHaveText('Saved.');
  const tabs = context.pages().length;
  await page.getByRole('link', { name: 'Go to dashboard →' }).click();
  await expect(page).toHaveURL('/');
  expect(context.pages()).toHaveLength(tabs);
  await expect(page.locator('.saved-week-column').last()).toHaveAttribute('aria-label', /3.0 minutes tracked, 1.2 minutes slouching/);
  await expect(page.locator('.connect-wearable-card')).toBeHidden();
  expect(await page.evaluate(() => window.__bblFixture.connected)).toBe(true);
  await page.evaluate(() => window.__bblFixture.emit({ sequence: 182, tracked_seconds: 240, slouch_seconds: 80 }));
  await expect.poll(async () => (await (await page.request.get('/api/v1/today')).json()).summary.tracked_seconds).toBe(240);
  await expect(page.locator('#today .today-summary-value')).toContainText('1.3');
  await expect(page.locator('.saved-week-column').last()).toHaveAttribute('aria-label', /4.0 minutes tracked, 1.3 minutes slouching/);
  await page.evaluate(() => window.__bblFixture.emit({ sequence: 183, tracked_seconds: 241, slouch_seconds: 80 }));
  await expect(page.locator('.posture-notice')).toBeVisible();
  await page.evaluate(() => window.__bblFixture.emit({ sequence: 184, state: 'upright', tracked_seconds: 242, slouch_seconds: 80 }));
  await expect(page.locator('.posture-notice')).toBeHidden();
  await expect(page.locator('.compact-header')).toHaveClass(/wearable-connected/);
  await expect(page.locator('.wearable-session-notice')).toBeHidden();
  await page.getByLabel('Account menu', { exact: true }).click();
  await page.getByRole('link', { name: 'Wearable →', exact: true }).click();
  await expect(page.getByRole('heading', { name: "You're ready." })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect wearable', exact: true })).toBeHidden();
  await expect(page.locator('[data-device-target="details"]')).toContainText('4.0 min tracked');
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  expect(await page.evaluate(() => window.__bblFixture.connected)).toBe(false);
  await expect(page.locator('.compact-header')).not.toHaveClass(/wearable-connected/);
});

test('saved readings refresh a dashboard in another tab', async ({ page, context }) => {
  await login(page);
  await page.goto('/wearable?ble_fixture=1');
  await page.getByRole('button', { name: 'Connect wearable', exact: true }).click();
  const dashboard = await context.newPage();
  await dashboard.goto('/');
  await page.evaluate(() => window.__bblFixture.emit({ slouch_seconds: 120 }));
  await expect(dashboard.locator('#today .today-summary-value')).toContainText('2.0');
  await expect(dashboard.locator('.saved-week-column').last()).toHaveAttribute('aria-label', /3.0 minutes tracked, 2.0 minutes slouching/);
});

test('top warning follows device candidate and recovery timing', async ({ page }) => {
  await login(page);
  await page.goto('/wearable?ble_fixture=1');
  await page.getByRole('button', { name: 'Connect wearable', exact: true }).click();
  await page.evaluate(() => {
    window.__bblFixture.emit({ state: 'upright', slouch_seconds: 0, episode_count: 0 });
    window.__bblFixture.emitWarning({ phase: 1, elapsed: 3500 });
  });
  const notice = page.locator('.posture-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toHaveCSS('z-index', '10000');
  expect((await notice.boundingBox()).y).toBeLessThan(30);
  const opacity = () => notice.evaluate(el => Number(getComputedStyle(el).opacity));
  expect(await opacity()).toBeGreaterThanOrEqual(0.5);
  expect(await opacity()).toBeLessThan(0.8);
  await page.evaluate(() => window.__bblFixture.emitWarning({ phase: 1, elapsed: 7000, sequence: 2 }));
  await expect(notice).toHaveCSS('opacity', '1');
  await page.evaluate(() => {
    window.__bblFixture.emit({ sequence: 182 });
    window.__bblFixture.emitWarning({ phase: 2, elapsed: 10000, sequence: 3, episode: 1 });
  });
  await expect.poll(() => notice.evaluate(el => el.getAnimations().length)).toBe(1);
  await page.evaluate(() => window.__bblFixture.emitWarning({ phase: 3, elapsed: 1500, sequence: 4, episode: 1 }));
  await expect.poll(opacity).toBeLessThan(0.51);
  await expect(notice).toBeHidden({ timeout: 2500 });
});
