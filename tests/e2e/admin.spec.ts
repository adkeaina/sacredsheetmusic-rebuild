import { test, expect } from '@playwright/test';
import { localRuntime } from '../../scripts/local-runtime';
test('administrator tools persist catalog, taxonomy, content, settings and captured messages', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(45000);
  const suffix = Date.now().toString(36);
  if (process.env.PREVIEW_URL) {
    test.skip(!process.env.ADMIN_STATE, 'Requires private administrator storage state');
    const state = JSON.parse(
      await (await import('node:fs/promises')).readFile(process.env.ADMIN_STATE!, 'utf8'),
    );
    await page.context().addCookies(state.cookies);
  } else {
    const response = await page.request.post('/api/auth/sign-up/email', {
      headers: { Origin: baseURL! },
      data: {
        username: 'admin' + suffix,
        name: 'Administrator ' + suffix,
        email: 'admin' + suffix + '@example.invalid',
        password: 'SampleAdmin!2026',
      },
    });
    expect(response.ok()).toBe(true);
    const { mf, db } = await localRuntime();
    try {
      await db
        .prepare("UPDATE users SET role='admin' WHERE username=?")
        .bind('admin' + suffix)
        .run();
    } finally {
      await mf.dispose();
    }
  }
  await page.goto('/admin/tags');
  await page.getByLabel('name', { exact: true }).fill('Test category ' + suffix);
  await page.getByLabel('slug', { exact: true }).fill('test-category-' + suffix);
  await page.getByRole('button', { name: 'Save record', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Changes saved');
  await page
    .locator('.admin-search')
    .getByRole('textbox')
    .fill('Test category ' + suffix);
  await page.locator('.admin-search').getByRole('button', { name: 'Search', exact: true }).click();
  await expect(
    page.getByRole('cell', { name: 'Test category ' + suffix, exact: false }),
  ).toBeVisible();
  await page.goto('/admin/pages');
  await page.getByLabel('slug', { exact: true }).fill('test-page-' + suffix);
  await page.getByLabel('title', { exact: true }).fill('Test information ' + suffix);
  await page.getByLabel('body', { exact: true }).fill('A persisted preview information page.');
  await page.getByLabel('section', { exact: true }).fill('faq');
  await page.getByRole('button', { name: 'Save record', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Changes saved');
  await page.goto('/about/test-page-' + suffix);
  await expect(page.getByRole('heading', { name: 'Test information ' + suffix })).toBeVisible();
  await page.goto('/admin/preferences');
  await page.getByLabel('key', { exact: true }).fill('sample-setting-' + suffix);
  await page.getByLabel('value', { exact: true }).fill('Saved value');
  await page.getByRole('button', { name: 'Save record', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Changes saved');
  await page.goto('/admin/catalog');
  await page.getByRole('button', { name: 'Regenerate preview', exact: true }).first().click();
  await expect(page.getByRole('status')).toContainText('Preview regenerated', { timeout: 20000 });
  const row = page
    .getByRole('row')
    .filter({
      has: page.getByRole('button', { name: 'Duplicate', exact: true }),
    })
    .first();
  await row.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edit song', exact: true })).toBeVisible();
  await expect(page.getByLabel('Song name', { exact: true })).toHaveValue(/\(copy\)/);
  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete this song', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Administration', exact: true })).toBeVisible();
  await page.goto('/admin/messages');
  await page.getByLabel('Subject', { exact: true }).fill('Test announcement ' + suffix);
  await page
    .getByLabel('Message', { exact: true })
    .fill('A captured preview announcement, never sent.');
  await page.getByRole('button', { name: 'Capture messages for review' }).click();
  await expect(page.getByRole('status')).toContainText('Messages captured privately');
  await page.goto('/admin/outbox');
  await expect(page.getByText('Test announcement ' + suffix).first()).toBeVisible();
  await page.goto('/admin/diagnostics');
  await page.getByRole('button', { name: 'Collect expired uploads and deleted files' }).click();
  await expect(page.getByRole('status')).toContainText('Maintenance completed');
});
test('composer accounts cannot access or mutate administrator resources', async ({
  page,
  baseURL,
}) => {
  const suffix = Date.now().toString(36);
  await page.request.post('/api/auth/sign-up/email', {
    headers: { Origin: baseURL! },
    data: {
      username: 'limited' + suffix,
      name: 'Limited ' + suffix,
      email: 'limited' + suffix + '@example.invalid',
      password: 'SampleComposer!2026',
    },
  });
  expect((await page.request.get('/admin/users')).status()).toBe(403);
  expect(
    (
      await page.request.post('/admin/tags', {
        headers: { Origin: baseURL! },
        form: {
          intent: 'save',
          name: 'Forbidden',
          slug: 'forbidden',
          type: 'topic',
        },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post('/api/admin-media', {
        headers: { Origin: baseURL! },
        form: { url: 'https://example.com/a.pdf' },
      })
    ).status(),
  ).toBe(403);
});
