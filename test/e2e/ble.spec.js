const { test, expect, login, logout, noOverflow } = require('./support/helpers');
async function connect(page) {
  await login(page);
  await page.goto('/wearable?ble_fixture=1');
  await expect(page.getByText('SIMULATED WEARABLE · isolated test data')).toBeVisible();
  await page.getByRole('button', { name: 'Connect wearable', exact: true }).click();
  await expect(page.locator('[data-device-target="connection"]')).toContainText('Connected');
}
async function savedSummary(page) { return (await (await page.request.get('/api/v1/today')).json()).summary; }
async function emit(page, reading = {}) { await page.evaluate(reading => window.__bblFixture.emit(reading), reading); }
const saving = page => page.locator('[data-device-target="saving"]');
const posture = page => page.locator('[data-device-target="posture"]');

test('new readings during successful uploads never flash a saving warning', async ({ page }) => {
  await connect(page);
  let writes = 0;
  await page.route('**/snapshot', async route => {
    writes++;
    // Keep a newer reading queued when this successful upload completes.
    await emit(page, { sequence: 181 + writes, tracked_seconds: 180 + writes });
    await route.continue();
  });
  await page.evaluate(() => {
    window.__savingFlashes = [];
    const observer = new MutationObserver(() => {
      for (const name of ['saving', 'retryButton']) {
        const el = document.querySelector(`[data-device-target="${name}"]`);
        if (!el.hidden) window.__savingFlashes.push(name);
      }
    });
    observer.observe(document.querySelector('.wearable-panel'), { subtree: true, attributes: true, attributeFilter: ['hidden'] });
  });
  await emit(page);
  await expect.poll(() => writes, { timeout: 15000 }).toBeGreaterThanOrEqual(7);
  await expect(saving(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Retry saving' })).toBeHidden();
  expect(await page.evaluate(() => window.__savingFlashes)).toEqual([]);
});

test('setup guides connection then calibration and updates dashboard connection card', async ({ page, context }, info) => {
  await login(page);
  await page.goto('/wearable?ble_fixture=1');
  await expect(page.getByRole('heading', { name: 'Connect your wearable' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Calibrate your posture' })).not.toBeVisible();
  await expect(page.locator('#today')).toHaveCount(0);
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  await expect(page.locator('.wearable-panel')).toHaveAttribute('data-setup-step', '0');
  await page.getByRole('button', { name: 'Connect wearable', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Calibrate your posture' })).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  await expect(page.locator('.wearable-panel')).toHaveAttribute('data-setup-step', '1');
  await expect(page.getByRole('link', { name: 'Go to dashboard →' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Connect wearable', exact: true })).not.toBeVisible();
  const dashboard = await context.newPage();
  await dashboard.goto('/');
  await expect(dashboard.locator('.connect-wearable-card')).toBeHidden();
  await emit(page, { state: 'calibrating' });
  await expect(posture(page)).toHaveText('Calibrating');
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  await emit(page, { sequence: 182, state: 'upright' });
  await expect(page.getByRole('heading', { name: 'Calibrate your posture' })).not.toBeVisible();
  await expect(posture(page)).toHaveText('Upright');
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
  await expect(page.locator('.wearable-panel')).toHaveAttribute('data-setup-step', '2');
  await expect(page.getByRole('link', { name: 'Go to dashboard →' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to dashboard →' })).toHaveAttribute('href', '/');
  await expect(page.getByRole('heading', { name: "You're ready." })).toBeVisible();
  await info.attach('pairing-ready.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Connect your wearable' })).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  await expect(dashboard.locator('.connect-wearable-card')).toBeVisible();
  await noOverflow(page);
});

test('qualified timing snapshots backfill ten seconds and refresh saved stats without counting short leans', async ({ page }) => {
  await connect(page);
  await emit(page, { sequence: 1, state: 'upright', tracked_seconds: 9, slouch_seconds: 0, episode_count: 0 });
  await expect(saving(page)).toHaveText('Saved.');
  await expect(saving(page)).toBeHidden();
  await expect.poll(async () => (await savedSummary(page)).slouch_seconds).toBe(0);
  await emit(page, { sequence: 2, state: 'slouching', tracked_seconds: 10, slouch_seconds: 10, episode_count: 1 });
  await expect.poll(async () => (await savedSummary(page)).episode_count).toBe(1);
  await expect.poll(async () => (await savedSummary(page)).slouch_seconds).toBe(10);
  await emit(page, { sequence: 3, state: 'upright', tracked_seconds: 13, slouch_seconds: 13, episode_count: 1 });
  await expect(saving(page)).toHaveText('Saved.');
  await expect(posture(page)).toHaveText('Upright');
  const result = await (await page.request.get('/api/v1/today')).json();
  expect(result.summary).toMatchObject({ tracked_seconds: 13, slouch_seconds: 13, episode_count: 1 });
});

test('wearable fixture saves through the real API, refreshes totals, and separates disconnect from ending', async ({ page }, info) => {
  await connect(page);
  await emit(page, { session_id: 0, state: 'sensor_error', tracked_seconds: 0, slouch_seconds: 0, episode_count: 0 });
  await expect(posture(page)).toHaveText('Sensor error');
  expect((await (await page.request.get('/api/v1/today')).json()).summary.session_count).toBe(0);
  await emit(page);
  await expect(posture(page)).toHaveText('Slouching');
  await expect(saving(page)).toHaveText('Saved.');
  await expect.poll(async () => (await savedSummary(page)).tracked_seconds).toBe(180);
  await expect.poll(async () => (await savedSummary(page)).slouch_seconds).toBe(70);
  expect((await savedSummary(page)).incomplete_session_count).toBe(1);
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(posture(page)).toContainText('(last received)');
  const last = await (await page.request.get('/api/v1/devices/00000000000000000000000000000001/session')).json();
  expect(last.session.ended).toBe(false);
  await noOverflow(page);
  await expect(page.locator('[data-device-target="trackingStep"] a')).not.toHaveAttribute('target', '_blank');
  await info.attach('wearable.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(page.locator('.tracker')).toHaveCSS('color', 'rgb(5, 30, 57)');
  await noOverflow(page);
  await info.attach('wearable-light.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await page.reload();
  await expect.poll(async () => (await savedSummary(page)).tracked_seconds).toBe(180);
  await expect(posture(page)).toHaveText('No live reading');
});

test('HTTP failure preserves newer data and retries without changing live Bluetooth status', async ({ page }) => {
  await connect(page);
  let fail = true;
  await page.route('**/snapshot', route => fail ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":"unavailable"}}' }) : route.continue());
  await emit(page);
  await expect(saving(page)).toContainText('Saving unavailable');
  await emit(page, { sequence: 182, tracked_seconds: 240, slouch_seconds: 80 });
  await expect(page.locator('[data-device-target="connection"]')).toContainText('Connected');
  fail = false;
  await page.getByRole('button', { name: 'Retry saving' }).click();
  await expect(saving(page)).toHaveText('Saved.');
  await expect.poll(async () => (await savedSummary(page)).tracked_seconds).toBe(240);
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
  expect((await savedSummary(page)).incomplete_session_count).toBe(0);
});

test('stale packets cannot replace live totals and a held heartbeat becomes stale without ending', async ({ page }) => {
  await connect(page);
  await emit(page);
  await expect(saving(page)).toHaveText('Saved.');
  await emit(page, { sequence: 180, tracked_seconds: 1, slouch_seconds: 0, episode_count: 0 });
  await expect(page.locator('[data-device-target="details"]')).toContainText('3.0 min tracked');
  await expect(page.locator('[data-device-target="connection"]')).toContainText('Signal paused', { timeout: 6000 });
  await expect(posture(page)).toContainText('last received');
  await emit(page, { sequence: 182, tracked_seconds: 181 });
  await expect(page.locator('[data-device-target="connection"]')).toContainText('Connected');
  await expect(saving(page)).toHaveText('Saved.');
});

test('switching identity clears old live state and first connection registers an unused wearable', async ({ page }) => {
  await connect(page);
  await emit(page);
  await expect(saving(page)).toHaveText('Saved.');
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await page.evaluate(() => { window.__bblFixture.deviceId = 'ffffffffffffffffffffffffffffffff'; window.__bblFixture.last = null; });
  await page.getByRole('button', { name: 'Connect wearable', exact: true }).click();
  await expect(posture(page)).toHaveText('No live reading');
  await emit(page);
  await expect(saving(page)).toHaveText('Saved.');
  await expect(posture(page)).toContainText('Slouching');
  expect((await (await page.request.get('/api/v1/devices')).json()).devices).toHaveLength(2);
  await expect.poll(async () => (await savedSummary(page)).tracked_seconds).toBe(360);
  expect((await (await page.request.get('/api/v1/today')).json()).summary.session_count).toBe(2);
});

test('a wearable already owned by another account stays live but cannot upload or change ownership', async ({ page }) => {
  await connect(page);
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await page.evaluate(() => { window.__bblFixture.deviceId = '00000000000000000000000000000002'; });
  await page.getByRole('button', { name: 'Connect wearable', exact: true }).click();
  await emit(page);
  await expect(saving(page)).toContainText('unavailable for this account');
  await expect(posture(page)).toContainText('Slouching');
  expect((await (await page.request.get('/api/v1/devices')).json()).devices).toHaveLength(1);
  expect((await (await page.request.get('/api/v1/today')).json()).summary.session_count).toBe(0);
});

test('pending data survives navigation; account switch in another tab pauses the old uploader', async ({ page, context }) => {
  await connect(page);
  await page.route('**/snapshot', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await emit(page);
  await expect(saving(page)).toContainText('Saving unavailable');
  await page.getByRole('link', { name: '← Your tracking' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('link', { name: 'Saving needs attention · Wearable →' })).toBeVisible();
  await page.getByRole('link', { name: 'Saving needs attention · Wearable →' }).click();
  await expect(saving(page)).toContainText('Saving unavailable');
  const other = await context.newPage();
  await other.goto('/');
  await logout(other);
  await login(other, 'outsider');
  await expect(saving(page)).toContainText('Account changed');
  await expect(page.getByRole('button', { name: 'Retry saving' })).toBeDisabled();
  expect((await (await other.request.get('/api/v1/today')).json()).summary.session_count).toBe(0);
});

test('dashboard separates pairing and unsupported wearable page never enables fixtures', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'bluetooth', { value: undefined, configurable: true }));
  await login(page);
  await expect(page.getByRole('button', { name: 'Connect wearable', exact: true })).toHaveCount(0);
  await expect(page.locator('.saved-week-column')).toHaveCount(7);
  await page.getByRole('link', { name: 'Connect your wearable →' }).click();
  await expect(page.getByRole('button', { name: 'Connect wearable', exact: true })).toBeDisabled();
  await expect(page.locator('[data-device-target="connection"]')).toContainText('Bluetooth unavailable');
  await expect(page.getByText('SIMULATED WEARABLE · isolated test data')).toHaveCount(0);
  expect(await page.evaluate(() => typeof window.__bblFixture)).toBe('undefined');
});

test('software calibration waits for device completion and allows recalibration', async ({ page }) => {
  await login(page);
  await page.goto('/wearable?ble_fixture=1');
  await page.getByRole('button', { name: 'Connect wearable', exact: true }).click();
  await page.getByRole('button', { name: 'Calibrate', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Calibrating…', exact: true })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Go to dashboard →' })).toBeHidden();
  await page.evaluate(() => window.__bblFixture.emit({ state: 'upright', sequence: 2, tracked_seconds: 0, slouch_seconds: 0, episode_count: 0 }));
  await expect(page.getByRole('link', { name: 'Go to dashboard →' })).toBeVisible();
  await page.getByRole('button', { name: 'Recalibrate', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Calibrating…', exact: true })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Go to dashboard →' })).toBeHidden();
});
