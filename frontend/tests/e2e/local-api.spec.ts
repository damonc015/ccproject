import { test, expect, type Page } from '@playwright/test';

async function signIn(page: Page, email: string) {
  await page.goto('http://127.0.0.1:5174');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('demo-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
}

test('local API: persistence, previews, registered sharing, role changes and revocation', async ({ page, browser }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await signIn(page, 'demo@example.com');
  await expect(page.getByText('Local demo: edits are saved', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '+ New document' }).click();
  await page.getByRole('dialog').getByLabel('Title').fill('person3-e2e.py');
  await page.getByRole('dialog').getByRole('button', { name: 'Create', exact: true }).click();
  const editor = page.locator('.cm-content');
  await expect(editor).toBeVisible();
  await expect(page.locator('.conn-connected')).toBeVisible();
  const documentUrl = page.url();

  const saved = page.waitForResponse(r => r.request().method() === 'PUT' && r.url().endsWith('/content'));
  await editor.fill('print("persistent")');
  expect((await saved).status()).toBe(204);
  await expect(page.locator('.save-saved')).toBeVisible();
  await page.reload();
  await expect(page.locator('.cm-content')).toHaveText('print("persistent")');

  await page.getByRole('tab', { name: 'Versions', exact: true }).click();
  await page.getByLabel('Version label').fill('Snapshot one');
  await page.getByRole('button', { name: 'Save version', exact: true }).click();
  await page.getByRole('button', { name: /Snapshot one/ }).click();
  await expect(page.locator('pre.preview')).toHaveText('print("persistent")');
  await page.getByRole('button', { name: /Run$/, exact: false }).click();
  await expect(page.getByText('[Local fixture] No code was executed.', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const share = page.getByRole('dialog', { name: 'Share document' });
  await share.getByLabel('Email to share with').fill('not-registered@example.com');
  await share.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(share.getByRole('alert')).toHaveText('No registered user has this email address.');
  await share.getByLabel('Email to share with').fill('grace@example.com');
  await share.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(share.getByLabel('Role for Grace')).toHaveValue('editor');

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  try {
    await signIn(guest, 'grace@example.com');
    await guest.getByRole('link').filter({ hasText: 'person3-e2e.py' }).click();
    await expect(guest.locator('.cm-content')).toHaveText('print("persistent")');
    await expect(guest.getByRole('button', { name: /Run$/ })).toBeEnabled();

    const changeRole = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/collaborators'));
    await share.getByLabel('Role for Grace').selectOption('viewer');
    expect((await changeRole).status()).toBe(200);
    await guest.reload();
    await expect(guest.getByText('You have view-only access.', { exact: false })).toBeVisible();
    await expect(guest.getByRole('button', { name: /Run$/ })).toBeDisabled();
    const oldText = await guest.locator('.cm-content').innerText();
    await guest.locator('.cm-content').click();
    await guest.keyboard.type('unauthorized edit');
    await expect(guest.locator('.cm-content')).toHaveText(oldText);

    await share.getByRole('button', { name: 'Remove Grace', exact: true }).click();
    await expect(share.getByLabel('Role for Grace')).toHaveCount(0);
    await guest.goto(documentUrl);
    await guest.reload();
    await expect(guest.getByRole('alert')).toHaveText('Document not found.');
    await guest.getByRole('link', { name: 'Back to documents' }).click();
    await expect(guest.getByRole('link').filter({ hasText: 'person3-e2e.py' })).toHaveCount(0);
  } finally {
    await guestContext.close();
  }
  await share.getByRole('button', { name: 'Done', exact: true }).click();
  await page.goto('http://127.0.0.1:5174');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete person3-e2e.py', exact: true }).click();
  await expect(page.getByRole('link').filter({ hasText: 'person3-e2e.py' })).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test('local registration is disabled and an outsider cannot open the seeded document', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('tab', { name: 'Create account', exact: true })).toHaveCount(0);
  await signIn(page, 'outsider@example.com');
  await expect(page.getByText('No documents yet.', { exact: false })).toBeVisible();
  await page.goto('/#/doc/doc_demo');
  await expect(page.getByRole('alert')).toHaveText('Document not found.');
});
