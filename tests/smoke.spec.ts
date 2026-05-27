import { test, expect } from '@playwright/test';

test('smoke: homepage loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Todo/);
  await page.screenshot({ path: '.sisyphus/evidence/smoke-homepage.png' });
});
