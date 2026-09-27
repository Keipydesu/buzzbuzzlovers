const { test, expect, login, upload, noOverflow } = require('./support/helpers');

test('compact Today opens details with responsive period charts and no data-table control', async ({ page }, info) => {
  await login(page);
  expect((await upload(page, { tracked: 1200, slouch: 300, episodes: 2 })).ok()).toBe(true);
  await page.reload();
  await page.getByRole('link', { name: 'View week details', exact: true }).click();
  await expect(page).toHaveURL('/details?period=week');
  await expect(page.getByRole('link', { name: 'Week', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: '← Your tracking' }).click();
  await page.locator('#today').click();
  await expect(page).toHaveURL('/details');
  await expect(page.locator('.daily-breakdown-center strong')).toHaveText('25.0%');
  await expect(page.locator('.daily-breakdown')).not.toHaveClass(/panel/);
  for (const [period, columns] of [['Week', 7], ['Month', 30]]) {
    await page.getByRole('link', { name: period, exact: true }).click();
    await expect(page.locator('.saved-week-column')).toHaveCount(columns);
    await expect(page.getByText('View data table', { exact: true })).toHaveCount(0);
    await noOverflow(page);
  }
  await info.attach('details-month.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await noOverflow(page);
  await page.getByRole('link', { name: 'Day', exact: true }).click();
  await expect(page.locator('.daily-breakdown-center strong')).toHaveText('25.0%');
  await noOverflow(page);
});
