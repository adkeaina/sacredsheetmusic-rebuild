import { test, expect } from '@playwright/test';
test('listeners can leave a public comment without exposing their email', async ({ page }) => {
  const text = 'Thank you for this thoughtful arrangement ' + Date.now();
  await page.goto('/all');
  await page.locator('.music-card .music-title').first().click();
  await page.getByRole('link', { name: 'Add a constructive comment / rating →' }).click();
  await page.getByLabel('Your name', { exact: true }).fill('Sample Listener');
  await page.getByLabel('Your email (optional)').fill('private-listener@example.invalid');
  await page.getByLabel('Comment', { exact: true }).fill(text);
  await page.getByLabel('Overall rating').selectOption('5');
  await page.getByLabel('What day comes after Saturday?').fill('Sunday');
  await page.getByRole('button', { name: 'Save comment' }).click();
  await expect(page.locator('.comments-section')).toContainText(text);
  await expect(page.locator('body')).not.toContainText('private-listener@example.invalid');
});
test('competition reviews are private and repeat submissions are blocked', async ({ page }) => {
  await page.goto('/competition');
  const entry = page
    .locator('.competition-entries article')
    .filter({ has: page.locator('details') })
    .first();
  if ((await entry.count()) === 0) {
    await expect(
      page.getByText('Already reviewed by you or your household.').first(),
    ).toBeVisible();
    return;
  }
  await entry.locator('summary').click();
  const privateText = 'Private composer feedback ' + Date.now();
  await entry.getByLabel('Overall rating').selectOption('5');
  await entry.getByLabel('Private feedback to the composer').fill(privateText);
  await entry.getByLabel('What day comes after Saturday?').fill('Sunday');
  await entry.getByRole('button', { name: 'Submit review' }).click();
  await expect(page.getByRole('status')).toContainText('review was recorded');
  await expect(page.locator('body')).not.toContainText(privateText);
  await page.getByRole('link', { name: 'View results', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Public points' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(privateText);
});
test('composer statistics are available and private tools reject anonymous visitors', async ({
  page,
  baseURL,
}) => {
  await page.goto('/composers');
  await page.locator('.composer-directory a').first().click();
  await page.getByRole('link', { name: 'View song statistics →' }).click();
  await expect(page.getByRole('columnheader', { name: 'Downloads', exact: true })).toBeVisible();
  expect(
    (
      await page.request.post('/api/editor', {
        headers: { Origin: baseURL! },
        data: { title: 'Unauthorized' },
      })
    ).status(),
  ).toBe(401);
});
