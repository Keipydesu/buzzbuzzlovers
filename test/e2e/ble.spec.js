const { test, expect, login, logout, noOverflow } = require('./support/helpers');
async function connect(page) {
  await login(page);
  await page.goto('/?ble_fixture=1');
  await expect(page.getByText('SIMULATED WEARABLE · isolated test data')).toBeVisible();
  await page.getByRole('button', { name: 'Connect wearable', exact: true }).click();
  await expect(page.locator('[data-device-target="connection"]')).toContainText('Bluetooth connected');
}
async function emit(page, reading = {}) { await page.evaluate(reading => window.__bblFixture.emit(reading), reading); }
const saving = page => page.locator('[data-device-target="saving"]');
const posture = page => page.locator('[data-device-target="posture"]');

test('wearable fixture saves through the real API, refreshes totals, and separates disconnect from ending', async ({ page }, info) => {
  await connect(page);
  await emit(page, { session_id: 0, state: 'sensor_error', tracked_seconds: 0, slouch_seconds: 0, episode_count: 0 });
  await expect(posture(page)).toHaveText('Sensor error');
  expect((await (await page.request.get('/api/v1/today')).json()).summary.session_count).toBe(0);
  await emit(page);
  await expect(posture(page)).toHaveText('Slouching');
  await expect(saving(page)).toHaveText('Saved.');
  await expect(page.locator('[data-device-target="todayTracked"]')).toHaveText('3.0');
  await expect(page.locator('[data-device-target="todaySlouch"]')).toHaveText('1.2');
  await expect(page.locator('[data-device-target="incomplete"]')).toHaveText('1 unfinished sessions included.');
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(posture(page)).toContainText('(last received)');
  const last = await (await page.request.get('/api/v1/devices/00000000000000000000000000000001/session')).json();
  expect(last.session.ended).toBe(false);
  await noOverflow(page);
  expect((await page.locator('#today').boundingBox()).y).toBeLessThan((await page.locator('.wearable-panel').boundingBox()).y);
  await info.attach('wearable.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(page.locator('.tracker')).toHaveCSS('color', 'rgb(5, 30, 57)');
  await noOverflow(page);
  await info.attach('wearable-light.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await page.reload();
  await expect(page.locator('[data-device-target="todayTracked"]')).toHaveText('3.0');
  await expect(posture(page)).toHaveText('No live reading');
});

test('HTTP failure preserves newer data and retries without changing live Bluetooth status', async ({ page }) => {
  await connect(page);
  let fail = true;
  await page.route('**/snapshot', route => fail ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":"unavailable"}}' }) : route.continue());
  await emit(page);
  await expect(saving(page)).toContainText('Saving unavailable');
  await emit(page, { sequence: 182, tracked_seconds: 240, slouch_seconds: 80 });
  await expect(page.locator('[data-device-target="connection"]')).toContainText('Bluetooth connected');
  fail = false;
  await page.getByRole('button', { name: 'Retry saving' }).click();
  await expect(saving(page)).toHaveText('Saved.');
  await expect(page.locator('[data-device-target="todayTracked"]')).toHaveText('4.0');
  const summary = await (await page.request.get('/api/v1/today')).json();
  expect(summary.summary).toMatchObject({ session_count: 1, tracked_seconds: 240, slouch_seconds: 80 });
});

test('first terminal snapshot is saved once; repeated terminal heartbeat and reload do not conflict', async ({ page }) => {
  await connect(page);
  let writes = 0;
  page.on('request', request => { if (request.method() === 'PUT' && request.url().endsWith('/snapshot')) writes++; });
  await emit(page, { state: 'ended' });
  await expect(saving(page)).toHaveText('Saved.');
  await emit(page, { state: 'ended', sequence: 182 });
  await expect(posture(page)).toHaveText('Session ended');
  await page.reload();
  await page.getByRole('button', { name: 'Connect wearable', exact: true }).click();
  await emit(page, { state: 'ended', sequence: 183 });
  await expect(saving(page)).toHaveText('Saved.');
  expect(writes).toBe(1);
  await expect(page.locator('[data-device-target="incomplete"]')).toHaveText('');
});

test('stale packets cannot replace live totals and a held heartbeat becomes stale without ending', async ({ page }) => {
  await connect(page);
  await emit(page);
  await expect(saving(page)).toHaveText('Saved.');
  await emit(page, { sequence: 180, tracked_seconds: 1, slouch_seconds: 0, episode_count: 0 });
  await expect(page.locator('[data-device-target="details"]')).toContainText('3.0 min tracked');
  await expect(page.locator('[data-device-target="connection"]')).toContainText('readings stale', { timeout: 6000 });
  await expect(posture(page)).toContainText('last received');
  await emit(page, { sequence: 182, tracked_seconds: 181 });
  await expect(page.locator('[data-device-target="connection"]')).toContainText('receiving readings');
  await expect(saving(page)).toHaveText('Saved.');
});

test('switching identity clears old live state and unknown devices cannot be claimed or saved', async ({ page }) => {
  await connect(page);
  await emit(page);
  await expect(saving(page)).toHaveText('Saved.');
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await page.evaluate(() => { window.__bblFixture.deviceId = 'ffffffffffffffffffffffffffffffff'; window.__bblFixture.last = null; });
  await page.getByRole('button', { name: 'Connect wearable', exact: true }).click();
  await expect(posture(page)).toHaveText('No live reading');
  await emit(page);
  await expect(saving(page)).toContainText('Ask the operator');
  await expect(posture(page)).toContainText('Slouching');
  expect((await (await page.request.get('/api/v1/devices')).json()).devices).toHaveLength(1);
  expect((await (await page.request.get('/api/v1/today')).json()).summary.session_count).toBe(1);
});

test('pending data blocks accidental navigation; account switch in another tab pauses the old uploader', async ({ page, context }) => {
  await connect(page);
  await page.route('**/snapshot', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await emit(page);
  await expect(saving(page)).toContainText('Saving unavailable');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('link', { name: 'Your groups / join a group' }).click();
  await expect(page).toHaveURL('/?ble_fixture=1');
  const other = await context.newPage();
  await other.goto('/');
  await logout(other);
  await login(other, 'outsider');
  await expect(saving(page)).toContainText('Account changed');
  await expect(page.getByRole('button', { name: 'Retry saving' })).toBeDisabled();
  expect((await (await other.request.get('/api/v1/today')).json()).summary.session_count).toBe(0);
});

test('normal dashboard never enables fixture controls and unsupported browsers retain saved history', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'bluetooth', { value: undefined, configurable: true }));
  await login(page);
  await expect(page.getByRole('button', { name: 'Connect wearable', exact: true })).toBeDisabled();
  await expect(page.locator('[data-device-target="connection"]')).toContainText('Bluetooth unavailable');
  await expect(page.locator('.personal-history tbody tr')).toHaveCount(7);
  await expect(page.getByText('SIMULATED WEARABLE · isolated test data')).toHaveCount(0);
  expect(await page.evaluate(() => typeof window.__bblFixture)).toBe('undefined');
});

test('a save during summary refresh triggers another refresh instead of leaving old totals on screen', async ({ page }) => {
  await connect(page);
  let release, holding = false, first = true;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/v1/weekly', async route => {
    if (first) { first = false; holding = true; await gate; }
    await route.continue();
  });
  try {
    await emit(page);
    await expect(saving(page)).toHaveText('Saved.');
    await expect.poll(() => holding).toBe(true);
    await emit(page, { sequence: 182, tracked_seconds: 240, slouch_seconds: 80 });
    await expect(saving(page)).toHaveText('Saved.');
  } finally { release(); }
  await expect(page.locator('[data-device-target="todayTracked"]')).toHaveText('4.0');
});
