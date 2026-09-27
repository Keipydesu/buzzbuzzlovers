const { test, expect, login, upload, noOverflow } = require('./support/helpers');

test('weekly chart uses saved days, distinguishes zero and missing, and averages only recorded days', async ({ page }, info) => {
  await login(page);
  await expect(page.locator('.account-nav')).toHaveCount(0);
  await expect(page.locator('.compact-header')).toHaveCount(1);
  await expect(page.locator('#today')).not.toContainText('first-seen');
  expect((await page.locator('.competition-hero').boundingBox()).y).toBeLessThan((await page.locator('#today').boundingBox()).y);
  await expect(page.locator('.saved-week-missing')).toHaveCount(7);
  await expect(page.locator('.saved-week-average')).toHaveCount(0);
  await expect(page.getByText('No saved activity this week.')).toBeVisible();
  expect((await upload(page, { tracked: 1200, slouch: 300 })).ok()).toBe(true);
  expect((await upload(page, { session: 2, tracked: 600, slouch: 60, observed: '2026-09-21T15:00:00Z' })).ok()).toBe(true);
  expect((await upload(page, { session: 3, tracked: 0, slouch: 0, episodes: 0, observed: '2026-09-20T15:00:00Z' })).ok()).toBe(true);
  await page.reload();
  await expect(page.locator('.saved-week-missing')).toHaveCount(4);
  await expect(page.locator('.saved-week-zero')).toHaveCount(1);
  await expect(page.locator('.saved-week-bar')).toHaveCount(2);
  await expect(page.locator('.weekly-footnote')).toContainText('Avg tracked 10.0 min / recorded day');
  await expect(page.locator('.saved-week-average')).toHaveAttribute('style', 'bottom: 50.0%');
  await expect(page.locator('.saved-week-column').last()).toHaveAttribute('aria-label', /20.0 minutes tracked, 5.0 minutes slouching/);
  await expect(page.locator('.weekly-data')).not.toHaveAttribute('open');
  await noOverflow(page);
  await info.attach('dashboard-dark.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(page.locator('.tracker')).toHaveCSS('color', 'rgb(5, 30, 57)');
  await noOverflow(page);
  await info.attach('dashboard-light.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
});

test('dashboard opened from wearable keeps the connection alive and loads saved history', async ({ page, context }) => {
  await login(page);
  await page.goto('/wearable?ble_fixture=1');
  await page.getByRole('button', { name: 'Connect wearable', exact: true }).click();
  await page.evaluate(() => window.__bblFixture.emit({}));
  await expect(page.locator('[data-device-target="saving"]')).toHaveText('Saved.');
  const nextPage = context.waitForEvent('page');
  await page.getByRole('link', { name: 'View dashboard ↗' }).click();
  const dashboard = await nextPage;
  await expect(dashboard.locator('.saved-week-column').last()).toHaveAttribute('aria-label', /3.0 minutes tracked, 1.2 minutes slouching/);
  await expect(dashboard.getByRole('button', { name: 'Connect wearable', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-device-target="connection"]')).toContainText('Bluetooth connected');
  await page.evaluate(() => window.__bblFixture.emit({ sequence: 182, tracked_seconds: 240, slouch_seconds: 80 }));
  await expect(page.locator('[data-device-target="todayTracked"]')).toHaveText('4.0');
  await dashboard.reload();
  await expect(dashboard.locator('.saved-week-column').last()).toHaveAttribute('aria-label', /4.0 minutes tracked, 1.3 minutes slouching/);
});
