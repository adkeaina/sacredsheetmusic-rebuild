import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('main public screens pass automated WCAG checks and reflow at 320 pixels', async ({
  page,
}) => {
  for (const path of [
    '/',
    '/search?q=prayer&live=1',
    '/composers',
    '/accounts/login',
    '/competition',
  ]) {
    await page.goto(path);
    await page.locator('main h1').waitFor();
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        description: v.description,
        nodes: v.nodes.map((n) => n.target),
      })),
      path,
    ).toEqual([]);
  }
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to music' })).toBeFocused();
  await page.getByRole('button', { name: 'Browse categories', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Music categories' })).toBeVisible();
  await page.screenshot({ path: '.cloudflare/mobile-320.png', fullPage: true });
});
