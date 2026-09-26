const { test, expect, fixture, login, signup, createGroup, noOverflow } = require('./support/helpers');

test('coach explains availability and sharing, validates, renders escaped response and recovers from failure', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Ask Muse →' }).click();
  await expect(page.getByText("Muse isn't connected yet.")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ask Muse', exact: true })).toBeDisabled();
  await expect(page.getByText(/Your tracking history and group data are not included/)).toBeVisible();
  fixture('coach', 'available');
  await page.reload();
  const question = page.getByLabel('What would you like to work on?');
  await question.fill('   ');
  await page.getByRole('button', { name: 'Ask Muse', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Ask a question between 1 and 2,000 characters.');
  await question.fill('How can I adjust my desk?');
  await page.getByRole('button', { name: 'Ask Muse', exact: true }).click();
  await expect(page.locator('.muse-answer')).toContainText('Try a comfortable screen distance.');
  expect(await page.evaluate(() => window.untrustedCoach)).toBeUndefined();
  await question.fill('Simulate unavailable service');
  await page.getByRole('button', { name: 'Ask Muse', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Muse could not respond right now. Please try again later.');
  await expect(question).toHaveValue('Simulate unavailable service');
  await question.fill('Try another question');
  await page.getByRole('button', { name: 'Ask Muse', exact: true }).click();
  await expect(page.locator('.muse-answer')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
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
  for (const path of ['/', '/groups', group.path, '/coach']) {
    await page.goto(path);
    for (const theme of ['light', 'dark']) {
      await page.getByRole('button', { name: `Switch to ${theme} mode` }).click();
      await expect(page.locator('.tracker')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('.tracker')).toHaveCSS('color', theme === 'light' ? 'rgb(5, 30, 57)' : 'rgb(249, 250, 252)');
      await noOverflow(page);
    }
  }
  await page.goto(`/groups/join/${group.code}`);
  await noOverflow(page);
  await info.attach('invitation.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
});
