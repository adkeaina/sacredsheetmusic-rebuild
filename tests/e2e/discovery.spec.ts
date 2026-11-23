import { test, expect } from '@playwright/test';
test('live search preserves input and filters while returning from an arrangement', async ({
  page,
}) => {
  await page.goto('/');
  const search = page.getByRole('searchbox', { name: 'Search sheet music' });
  await search.fill('morning');
  await expect(page.getByRole('heading', { name: /Search Results for/ })).toBeVisible();
  await expect(page.getByText(/6 arrangements found/)).toBeVisible();
  await search.fill('morning light');
  await expect(page.getByText(/3 arrangements found/)).toBeVisible();
  await page.getByLabel('Filter by type').selectOption('satb');
  await expect(page.getByText(/1 arrangement found/)).toBeVisible();
  await page.locator('.music-card .music-title').first().click();
  await expect(page.getByRole('heading', { name: 'O Morning Light', exact: true })).toBeVisible();
  await page.goBack();
  await expect(search).toHaveValue('morning light');
  await expect(page.getByLabel('Filter by type')).toHaveValue('satb');
});
test('anonymous bookmarks persist and remain isolated from another browser', async ({
  page,
  browser,
}) => {
  await page.goto('/all');
  await page.locator('.music-card .music-title').first().click();
  await page.getByRole('button', { name: 'Bookmark this arrangement' }).click();
  await expect(page.getByRole('heading', { name: 'Your Bookmarked Songs' })).toBeVisible();
  await expect(page.locator('.music-card')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.music-card')).toHaveCount(1);
  const other = await browser.newPage();
  await other.goto('/music/wishlist');
  await expect(other.getByText('You have no bookmarked songs yet.')).toBeVisible();
  await other.close();
});
test('category browsing, score downloads and mobile navigation remain accessible', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Browse categories' }).click();
  await page.locator('.category-nav').getByRole('link', { name: 'Christmas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Christmas', exact: true })).toBeVisible();
  await page.locator('.music-card .music-title').first().click();
  await expect(page.locator('audio')).toBeVisible();
  const pdf = await page.getByRole('link', { name: 'View PDF', exact: true }).getAttribute('href');
  const response = await page.request.get(pdf!);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/pdf');
  await expect(page.locator('body')).not.toHaveJSProperty('scrollWidth', 0);
});

test('typing during composition waits and a newer search wins', async ({ page }) => {
  await page.goto('/');
  const input = page.getByRole('searchbox', { name: 'Search sheet music' });
  await input.dispatchEvent('compositionstart');
  await input.fill('morning');
  await page.waitForTimeout(450);
  expect(new URL(page.url()).pathname).toBe('/');
  await input.dispatchEvent('compositionend');
  await expect(page.getByRole('heading', { name: /Search Results for/ })).toBeVisible();
  await input.fill('peace');
  await input.fill('quiet prayer');
  await expect(
    page.getByRole('heading', {
      name: 'Search Results for: quiet prayer',
      exact: true,
    }),
  ).toBeVisible();
  await expect(input).toHaveValue('quiet prayer');
  await expect(page.getByText(/3 arrangements found/)).toBeVisible();
});
