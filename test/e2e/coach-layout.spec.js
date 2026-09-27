const { test, expect, fixture, login, signup, createGroup, noOverflow } = require('./support/helpers');

test('coach explains availability and sharing, renders escaped response and recovers from failure', async ({ page }) => {
  await login(page);
  await page.goto('/coach');
  await expect(page.locator('.muse-mode')).toContainText('Demo · scripted replies');
  await expect(page.getByRole('button', { name: 'Analyze my posture', exact: true })).toHaveCount(0);
  fixture('coach', 'available');
  await page.reload();
  await page.getByText('How your conversation is shared', { exact: true }).click();
  await expect(page.locator('.coach-sharing')).toContainText('your own tracked totals');
  const question = page.getByLabel('Your message to Muse');
  const send = page.getByRole('button', { name: 'Send', exact: false });
  await question.fill('How can I adjust my desk?');
  await send.click();
  await expect(page.locator('.muse-bubble').last()).toContainText('Try a comfortable screen distance.');
  expect(await page.evaluate(() => window.untrustedCoach)).toBeUndefined();
  await question.fill('Simulate unavailable service');
  await send.click();
  await expect(page.getByRole('alert')).toHaveText('Muse could not respond right now. Please try again later.');
  await expect(question).toHaveValue('Simulate unavailable service');
  await question.fill('Try another question');
  await send.click();
  await expect(page.getByRole('alert')).toBeHidden();
  await expect(page.locator('.muse-bubble-user')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('.muse-bubble-user')).toHaveCount(2);
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  await expect(send).toBeEnabled();
  await expect(page.locator('.muse-bubble-user')).toHaveCount(0);
  await noOverflow(page);
});

test('every screen fits the viewport in both themes with usable account controls', async ({ page }, info) => {
  for (const path of ['/', '/login', '/signup']) {
    await page.goto(path);
    for (const theme of ['light', 'dark']) {
      await page.getByRole('button', { name: `Switch to ${theme} mode` }).click();
      await expect(page.locator('.tracker')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('.tracker')).toHaveCSS('color', theme === 'light' ? 'rgb(5, 30, 57)' : 'rgb(249, 250, 252)');
      await noOverflow(page);
      for (const control of await page.locator('.auth-submit, .theme-button, .landing-page .competition-primary').all()) {
        expect((await control.boundingBox()).height).toBeGreaterThanOrEqual(44);
      }
    }
  }
  await page.goto('/signup');
  await signup(page, 'a'.repeat(24));
  const group = await createGroup(page, 'A'.repeat(40));
  for (const path of ['/', '/groups', group.path, '/coach', '/wearable']) {
    await page.goto(path);
    for (const theme of ['light', 'dark']) {
      await page.getByRole('button', { name: `Switch to ${theme} mode` }).click();
      await expect(page.locator('.tracker')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('.tracker')).toHaveCSS('color', theme === 'light' ? 'rgb(5, 30, 57)' : 'rgb(249, 250, 252)');
      await noOverflow(page);
      for (const control of await page.locator('.compact-header .theme-button, .compact-header .header-wearable, .account-menu > details > summary').all()) {
        expect((await control.boundingBox()).height).toBeGreaterThanOrEqual(44);
      }
    }
  }
  await page.goto(`/groups/join/${group.code}`);
  await noOverflow(page);
  await info.attach('invitation.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
});
