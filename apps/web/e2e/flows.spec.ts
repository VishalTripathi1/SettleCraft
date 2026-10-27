import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
test('register, approve funding, send, inspect ledger, settings, and logout', async ({
  page,
  browser,
}, testInfo) => {
  const name = `Demo ${randomUUID().slice(0, 8)}`,
    email = `${randomUUID()}@e2e.local`;
  await page.goto('/register');
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('SettleCraft-e2e-1234!');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Hello, Demo.` })).toBeVisible();
  await page.goto('/app/fund-demo');
  await page.getByRole('button', { name: 'Request demo funds', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Request sent for review.' })).toBeVisible();
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await admin.goto('http://127.0.0.1:5174/login');
  await admin.getByRole('button', { name: 'Admin', exact: true }).click();
  await admin.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(admin.getByRole('heading', { name: 'The bigger picture.' })).toBeVisible();
  await admin.goto('http://127.0.0.1:5174/admin/reviews');
  await admin.getByRole('button', { name: /Funding requests/ }).click();
  await admin
    .locator('.review-card')
    .filter({ hasText: name })
    .getByRole('button', { name: 'Approve funding' })
    .click();
  await admin.getByLabel('Reason for this decision').fill('Approved synthetic E2E funding');
  await admin.getByRole('button', { name: 'Confirm approve' }).click();
  await expect(admin.getByRole('dialog')).toBeHidden();
  await page.goto('/app/send');
  await page.getByLabel('Recipient email').fill('priya@settlecraft.local');
  await page.getByLabel('Amount in INR').fill('500');
  await page.getByLabel(/Note/).fill('Browser acceptance payment');
  await page.getByRole('button', { name: 'Review payment' }).click();
  await expect(page.getByRole('heading', { name: 'Everything look right?' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm & send' }).click();
  await expect(page.getByRole('heading', { name: 'The complete picture.' })).toBeVisible();
  await expect(page.getByText('completed', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('DEBIT', { exact: true })).toBeVisible();
  await expect(page.getByText('CREDIT', { exact: true })).toBeVisible();
  await page.goto('/app/dashboard');
  await expect(page.locator('.balance')).toContainText('₹500.00');
  mkdirSync('docs/screenshots', { recursive: true });
  await page.screenshot({
    path: `docs/screenshots/wallet-${testInfo.project.name}.png`,
    fullPage: true,
  });
  if (testInfo.project.name === 'mobile') {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.getByRole('link', { name: 'Settings', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
  } else await page.goto('/app/settings');
  await page.getByLabel('Full name').fill(`${name} Updated`);
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Profile updated.')).toBeVisible();
  await admin.goto('http://127.0.0.1:5174/admin/integrity');
  await admin.getByRole('button', { name: 'Run reconciliation' }).click();
  await expect(admin.getByRole('heading', { name: 'Every entry accounted for.' })).toBeVisible();
  await admin.screenshot({
    path: `docs/screenshots/integrity-${testInfo.project.name}.png`,
    fullPage: true,
  });
  if (testInfo.project.name === 'mobile')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Good to see you again.' })).toBeVisible();
  await adminContext.close();
});
test('landing and protected routes work at the target viewport', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Move money. Keep the whole story.' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await page.goto('/admin/overview');
  await expect(page.getByRole('heading', { name: 'Good to see you again.' })).toBeVisible();
});

test('public pages have no serious or critical accessibility violations', async ({ page }) => {
  for (const path of ['/', '/login']) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    ).toEqual([]);
  }
});

test('workspace accessibility has no serious or critical violations', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The bigger picture.' })).toBeVisible();
  const failures: unknown[] = [];
  for (const path of [
    '/app/dashboard',
    '/app/send',
    '/app/fund-demo',
    '/app/settings',
    '/admin/overview',
    '/admin/reviews',
    '/admin/integrity',
    '/admin/risk-rules',
  ]) {
    await page.goto(path);
    await page.locator('.page-heading').waitFor();
    const result = await new AxeBuilder({ page }).analyze();
    for (const violation of result.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    ))
      failures.push({ path, id: violation.id, nodes: violation.nodes.map((n) => n.target) });
  }
  expect(failures).toEqual([]);
});
