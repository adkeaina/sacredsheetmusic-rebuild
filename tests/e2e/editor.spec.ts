import { test, expect } from '@playwright/test';
test('a composer saves a draft, uploads a score, publishes, edits and removes it', async ({
  page,
  baseURL,
}) => {
  const suffix = Date.now().toString(36);
  const response = await page.request.post('/api/auth/sign-up/email', {
    headers: { Origin: baseURL! },
    data: {
      username: 'editor' + suffix,
      name: 'Editor ' + suffix,
      email: 'editor' + suffix + '@example.invalid',
      password: 'SampleEditor!2026',
    },
  });
  expect(response.ok()).toBe(true);
  await page.goto('/admin/products/new_original_song');
  await page.getByLabel('Song name', { exact: true }).fill('Original Test Piece ' + suffix);
  await page
    .getByLabel('Description / song background')
    .fill('A test score supplied by its creator.');
  await page.getByLabel('SATB', { exact: true }).check();
  await page.getByLabel('I have permission to share these files and this music.').check();
  await page.getByLabel('PDF sheet music').setInputFiles('public/fixtures/sample.pdf');
  await page.getByRole('button', { name: 'Save this song', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Song saved and published', {
    timeout: 15000,
  });
  await page.getByRole('link', { name: 'View song page' }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Original Test Piece ' + suffix,
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'View PDF', exact: true })).toBeVisible();
  await page.goto('/admin');
  await page
    .getByRole('row')
    .filter({ hasText: 'Original Test Piece ' + suffix })
    .getByRole('link', { name: 'Edit', exact: true })
    .click();
  await page.getByLabel('Song name', { exact: true }).fill('Revised Test Piece ' + suffix);
  await page.getByRole('button', { name: 'Save this song', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Song saved and published');
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete this song', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Composer workspace' })).toBeVisible();
  await expect(
    page.getByRole('row').filter({ hasText: 'Revised Test Piece ' + suffix }),
  ).toHaveCount(0);
});
test('multipart transfer remains private, rejects MIME mismatch, and can be retried safely', async ({
  page,
  baseURL,
}) => {
  const suffix = Date.now().toString(36);
  expect(
    (
      await page.request.post('/api/auth/sign-up/email', {
        headers: { Origin: baseURL! },
        data: {
          username: 'transfer' + suffix,
          name: 'Transfer ' + suffix,
          email: 'transfer' + suffix + '@example.invalid',
          password: 'SampleEditor!2026',
        },
      })
    ).ok(),
  ).toBe(true);
  const post = async (path: string, data: unknown) =>
    page.request.post(path, { headers: { Origin: baseURL! }, data });
  const saved = await (
    await post('/api/editor', {
      title: 'Multipart ' + suffix,
      voicing: 'SATB',
      tagIds: [],
      rights: true,
    })
  ).json();
  const ticket = await (
    await post('/api/uploads/reserve', {
      arrangementId: saved.id,
      filename: 'multipart.pdf',
      contentType: 'application/pdf',
      kind: 'score',
      size: 8388641,
    })
  ).json();
  expect((await post('/api/uploads/complete/' + ticket.id, {})).status()).toBe(400);
  await page.goto('/admin');
  const firstStatus = await page.evaluate(async (id) => {
    const bytes = new Uint8Array(8388608);
    bytes.set(new TextEncoder().encode('%PDF-1.7\n'));
    const response = await fetch('/api/uploads/part/' + id + '?part=1', {
      method: 'POST',
      body: bytes,
    });
    return response.status;
  }, ticket.id);
  expect(firstStatus).toBe(200);
  expect(
    (
      await page.request.post('/api/uploads/part/' + ticket.id + '?part=2', {
        headers: { Origin: baseURL! },
        data: Buffer.alloc(33),
      })
    ).ok(),
  ).toBe(true);
  const complete = await (await post('/api/uploads/complete/' + ticket.id, {})).json();
  expect((await post('/api/uploads/complete/' + ticket.id, {})).ok()).toBe(true);
  expect((await page.request.get('/files/' + complete.id)).ok()).toBe(true);
  const anonymous = await page.request.get('/files/' + complete.id, {
    headers: { Cookie: '' },
  });
  expect(anonymous.status()).toBe(404);
  const invalid = await (
    await post('/api/uploads/reserve', {
      arrangementId: saved.id,
      filename: 'fake.pdf',
      contentType: 'application/pdf',
      kind: 'score',
      size: 13,
    })
  ).json();
  expect(
    (
      await page.request.post('/api/uploads/part/' + invalid.id + '?part=1', {
        headers: { Origin: baseURL! },
        data: Buffer.from('<html></html>'),
      })
    ).status(),
  ).toBe(400);
  await post('/api/uploads/cancel/' + invalid.id, {});
  await post('/api/editor', { intent: 'delete', id: saved.id });
});
test('a WAV recording can be converted to MP3 in the browser', async ({ page, baseURL }) => {
  test.setTimeout(60000);
  const suffix = Date.now().toString(36);
  await page.request.post('/api/auth/sign-up/email', {
    headers: { Origin: baseURL! },
    data: {
      username: 'audio' + suffix,
      name: 'Audio ' + suffix,
      email: 'audio' + suffix + '@example.invalid',
      password: 'SampleEditor!2026',
    },
  });
  await page.goto('/admin/products/new_original_song');
  await page.getByLabel('Song name', { exact: true }).fill('Audio conversion ' + suffix);
  await page.getByLabel('SATB', { exact: true }).check();
  await page.getByLabel('I have permission to share these files and this music.').check();
  await page.getByLabel('Recording', { exact: true }).setInputFiles('public/fixtures/sample.wav');
  await page.getByLabel('Convert WAV / AAC to MP3 in this browser (optional)').check();
  await page.getByRole('button', { name: 'Save this song', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Song saved and published', {
    timeout: 45000,
  });
  await expect(page.getByRole('link', { name: 'sample.mp3', exact: true })).toBeVisible();
  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete this song', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Composer workspace' })).toBeVisible();
});
test('a malformed PDF stays recoverable in a draft with an honest processing error', async ({
  page,
  baseURL,
}) => {
  const key = 'broken' + Date.now().toString(36);
  await page.request.post('/api/auth/sign-up/email', {
    headers: { Origin: baseURL! },
    data: {
      username: key,
      name: 'Broken PDF ' + key,
      email: key + '@example.invalid',
      password: 'SampleEditor!2026',
    },
  });
  await page.goto('/admin/products/new_original_song');
  await page.getByLabel('Song name', { exact: true }).fill('Recoverable PDF ' + key);
  await page.getByLabel('SATB', { exact: true }).check();
  await page.getByLabel('I have permission to share these files and this music.').check();
  await page.getByLabel('PDF sheet music').setInputFiles({
    name: 'broken.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\nNot a valid PDF document'),
  });
  await page.getByRole('button', { name: 'Save this song', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('PDF processing failed', { timeout: 15000 });
  await expect(page.getByRole('link', { name: 'broken.pdf' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Regenerate preview' })).toBeVisible();
  await expect(page.getByRole('status')).not.toContainText('published');
  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete this song', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Composer workspace' })).toBeVisible();
});
