import { expect, test } from '@playwright/test';

test('desktop landing has the learning story and no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page).toHaveTitle(/Pathwise/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('.goal-panel-wrap')).toBeVisible();
  await expect(page.locator('.landing-story')).toBeVisible();
  await expect(page.locator('.path-showcase')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440);
});

test('mobile landing fits viewport and account mode switches to sign-in', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('input[name="name"]')).toHaveCount(0);
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.locator('input[name="password"]')).toHaveAttribute('placeholder', 'Your password');

  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.locator('input[name="name"]')).toBeVisible();
});
