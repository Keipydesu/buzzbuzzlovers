const { test, expect, login, logout, signup, createGroup, noOverflow } = require('./support/helpers');

test('create group, validate name, join by normalized code, repeat, leave and rejoin', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Your groups / join a group' }).click();
  await expect(page.getByText('Create a group or join your friends with a code.')).toBeVisible();
  await page.getByLabel('Group name').fill('   ');
  await page.getByRole('button', { name: 'Create group', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText("can't be blank");
  const group = await createGroup(page);
  await expect(page.getByText('1 member · Weekly competition')).toBeVisible();
  await expect(page.locator('.ranking-row')).toContainText('Unranked');
  await page.getByText('How rankings work', { exact: true }).click();
  await expect(page.getByText(/Equal scores share rank/)).toBeVisible();
  await logout(page);
  await expect(page).toHaveURL('/login');
  await login(page, 'bob');
  const denied = await page.goto(group.path);
  expect(denied.status()).toBe(404);
  await page.goto('/groups');
  await expect(page.getByRole('link', { name: 'Desk friends', exact: true })).toHaveCount(0);
  await page.getByLabel('Invite code').fill(group.code.toLowerCase());
  await page.getByRole('button', { name: 'Join group', exact: true }).click();
  await expect(page.getByText('2 members · Weekly competition')).toBeVisible();
  await noOverflow(page);
  await page.goto(`/groups/join/${group.code}`);
  await page.getByRole('button', { name: 'Join group', exact: true }).click();
  await expect(page.locator('.ranking-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Leave group' }).click();
  await expect(page).toHaveURL('/groups');
  expect((await page.goto(group.path)).status()).toBe(404);
  await page.goto(`/groups/join/${group.code}`);
  await page.getByRole('button', { name: 'Join group', exact: true }).click();
  await expect(page.locator('.ranking-row')).toHaveCount(2);
});

for (const method of ['signup', 'login']) {
  test(`invitation survives ${method}, requires explicit join and supports independent sessions`, async ({ page, browser }, info) => {
    await login(page);
    const group = await createGroup(page);
    const friendContext = await browser.newContext({ baseURL: 'http://127.0.0.1:3118', viewport: info.project.use.viewport });
    try {
      const friend = await friendContext.newPage();
      await friend.goto(`/groups/join/${group.code}`);
      await expect(friend.getByRole('heading', { name: 'Join Desk friends' })).toBeVisible();
      await noOverflow(friend);
      if (method === 'signup') {
        await friend.getByRole('link', { name: 'create an account', exact: true }).click();
        await signup(friend, 'invited_friend');
      } else {
        await friend.getByRole('link', { name: 'Log in', exact: true }).click();
        await expect(friend).toHaveURL('/login');
        await login(friend, 'bob');
      }
      await expect(friend).toHaveURL(`/groups/join/${group.code}`);
      await page.reload();
      await expect(page.locator('.ranking-row')).toHaveCount(1);
      await friend.getByRole('button', { name: 'Join group', exact: true }).click();
      await expect(friend).toHaveURL(group.path);
      await page.reload();
      await expect(page.locator('.ranking-row')).toHaveCount(2);
      await expect(page.getByRole('navigation', { name: 'Account' })).toContainText('alice');
    } finally { await friendContext.close(); }
  });
}

test('invalid invitations neither reveal a group nor join one', async ({ page }) => {
  expect((await page.goto('/groups/join/INVALID00000')).status()).toBe(404);
  await login(page);
  await page.goto('/groups');
  await page.getByLabel('Invite code').fill('INVALID00000');
  await page.getByRole('button', { name: 'Join group', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Invite code was not found. Check it and try again.');
  await page.goto('/groups');
  await expect(page.getByText('Create a group or join your friends with a code.')).toBeVisible();
});
