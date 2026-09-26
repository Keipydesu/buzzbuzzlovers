const { test, expect, login, logout, createGroup, upload, noOverflow } = require('./support/helpers');

test('saved tracking survives refresh, retries, stale data and ending; remains account scoped', async ({ page }) => {
  await login(page);
  const first = await upload(page);
  expect(first.ok()).toBe(true);
  expect((await first.json()).disposition).toBe('accepted');
  expect((await (await upload(page)).json()).disposition).toBe('duplicate');
  expect((await upload(page, { tracked: 700 })).status()).toBe(409);
  expect((await upload(page, { sequence: 2, tracked: 500 })).status()).toBe(422);
  expect((await upload(page, { sequence: 2, tracked: 1200, slouch: 180, episodes: 2 })).ok()).toBe(true);
  expect((await (await upload(page)).json()).disposition).toBe('stale');
  await page.reload();
  const today = page.locator('#today');
  await expect(today).toContainText('20.0');
  await expect(today).toContainText('3.0');
  await expect(today).toContainText('1 unfinished sessions included.');
  await expect(page.locator('.personal-history tbody tr')).toHaveCount(7);
  await expect(page.locator('.personal-history tbody tr').last()).toContainText('20.0');
  expect((await upload(page, { sequence: 3, tracked: 1200, slouch: 180, episodes: 2, state: 'ended' })).ok()).toBe(true);
  expect((await upload(page, { sequence: 4, tracked: 1300, slouch: 180, episodes: 2 })).status()).toBe(409);
  await page.reload();
  await expect(today).not.toContainText('unfinished sessions');
  const summary = await (await page.request.get('/api/v1/today')).json();
  expect(summary.summary).toMatchObject({ tracked_seconds: 1200, slouch_seconds: 180, episode_count: 2, session_count: 1 });
  await noOverflow(page);
  await logout(page);
  await expect(page).toHaveURL('/login');
  await login(page, 'outsider');
  await expect(page.getByText('No saved activity today.')).toBeVisible();
  expect((await upload(page)).status()).toBe(404);
  expect((await page.request.get('/api/v1/devices/00000000000000000000000000000001/session')).status()).toBe(404);
  const otherSummary = await (await page.request.get('/api/v1/today')).json();
  expect(otherSummary.summary.tracked_seconds).toBe(0);
});

test('competition weights sessions, ties ranks, separates no data and shows improvement after refresh', async ({ page }, info) => {
  await login(page);
  const group = await createGroup(page);
  // Alice: 120/1200 = 10% (not the unweighted mean 16.67%), prior week 50%.
  expect((await upload(page, { tracked: 300, slouch: 90 })).ok()).toBe(true);
  expect((await upload(page, { session: 2, tracked: 900, slouch: 30 })).ok()).toBe(true);
  expect((await upload(page, { session: 3, tracked: 600, slouch: 300, observed: '2026-09-16T15:00:00Z' })).ok()).toBe(true);
  for (const [name, device, slouch] of [['bob', 2, 60], ['carol', 3, 120], ['dana', 4, null]]) {
    await logout(page);
  await expect(page).toHaveURL('/login');
    await login(page, name);
    await page.goto(`/groups/join/${group.code}`);
    await page.getByRole('button', { name: 'Join group', exact: true }).click();
    await expect(page).toHaveURL(group.path);
    if (slouch !== null) expect((await upload(page, { device, slouch })).ok()).toBe(true);
  }
  await page.reload();
  const rows = page.locator('.ranking-row');
  await expect(rows).toHaveCount(4);
  for (const [index, name, rank, score] of [[0, 'alice', '1', '10.00%'], [1, 'bob', '1', '10.00%'], [2, 'carol', '3', '20.00%'], [3, 'dana', '—', 'Unranked']]) {
    await expect(rows.nth(index)).toContainText(name);
    await expect(rows.nth(index).locator('.rank-number')).toHaveText(rank);
    await expect(rows.nth(index).locator('.member-score')).toHaveText(score);
  }
  await expect(page.getByText('alice · 40.00 percentage points less slouching than last week.')).toBeVisible();
  await noOverflow(page);
  await info.attach('leaderboard.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await page.getByRole('link', { name: '← Your tracking' }).click();
  await expect(page.locator('.competition-standing')).toContainText('No recorded activity this week yet.');
  await logout(page);
  await expect(page).toHaveURL('/login');
  await login(page);
  await expect(page.locator('.competition-standing')).toContainText('#1');
  await expect(page.locator('.competition-standing')).toContainText('10.00% slouch share');
  await page.getByRole('link', { name: 'See leaderboard →' }).click();
  await expect(page).toHaveURL(group.path);
  await expect(page.locator('.ranking-you')).toBeVisible();
  expect((await upload(page, { session: 2, sequence: 2, tracked: 900, slouch: 270 })).ok()).toBe(true);
  await page.reload();
  await expect(page.locator('.ranking-you .rank-number')).toHaveText('3');
  await expect(page.locator('.ranking-you .member-score')).toHaveText('30.00%');
});

test('zero-duration saved sessions differ from missing history and joining includes prior activity', async ({ page }) => {
  await login(page);
  expect((await upload(page, { tracked: 0, slouch: 0, episodes: 0 })).ok()).toBe(true);
  await page.reload();
  await expect(page.getByText('No saved activity today.')).not.toBeVisible();
  await expect(page.locator('.personal-history tbody tr').last().getByRole('cell')).toHaveText(['0.0', '0.0']);
  const group = await createGroup(page);
  await expect(page.locator('.ranking-you .member-score')).toHaveText('Unranked');
  await logout(page);
  await expect(page).toHaveURL('/login');
  await login(page, 'bob');
  expect((await upload(page, { device: 2, tracked: 600, slouch: 60 })).ok()).toBe(true);
  await page.goto(`/groups/join/${group.code}`);
  await page.getByRole('button', { name: 'Join group', exact: true }).click();
  await expect(page.locator('.ranking-you .member-score')).toHaveText('10.00%');
  await page.getByRole('button', { name: 'Leave group' }).click();
  await expect(page).toHaveURL('/groups');
  await logout(page);
  await expect(page).toHaveURL('/login');
  await login(page);
  await page.goto(group.path);
  await expect(page.locator('.ranking-row')).toHaveCount(1);
  await expect(page.locator('.ranking-row')).not.toContainText('bob');
});
