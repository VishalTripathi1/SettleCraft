import { test, expect, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Rahul', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
}

test('slow failed login blocks repeat submission and recovers with keyboard', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/v1/auth/login', async (route) => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 650));
    await route.fulfill({
      status: 503,
      json: { code: 'UNAVAILABLE', message: 'Service temporarily unavailable. Try again.' },
    });
  });
  await page.goto('/login');
  await page.getByRole('button', { name: 'Rahul', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).press('Enter');
  await expect(page.getByRole('button', { name: 'Signing you in…' })).toBeDisabled();
  await expect(page.locator('.motion-spin')).toBeVisible();
  await page.getByLabel('Password', { exact: true }).press('Enter');
  await expect(page.getByRole('alert')).toContainText('Service temporarily unavailable');
  expect(calls).toBe(1);
  await page.unroute('**/api/v1/auth/login');
  await page.getByLabel('Password', { exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
});

for (const status of ['COMPLETED', 'PENDING_REVIEW', 'FAILED']) {
  test(`slow ${status} payment shows only its confirmed outcome`, async ({ page }) => {
    await login(page);
    let requests = 0;
    const record = {
      id: 'stress-transfer',
      reference: 'SC-STRESS',
      amount: '100',
      sender_id: 'sender',
      recipient_id: 'recipient',
      sender_name: 'Rahul',
      recipient_name: 'Priya',
      status,
      note: 'Stress test',
      failure_reason: status === 'FAILED' ? 'Insufficient balance' : null,
      entries: [],
      decisions: [],
      reversals: [],
      risk: null,
      journal_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await page.route('**/api/v1/transfers', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      requests++;
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.fulfill({ json: record });
    });
    await page.route('**/api/v1/transfers/stress-transfer', (route) =>
      route.fulfill({ json: record }),
    );
    await page.goto('/app/send');
    await page.getByLabel('Recipient email').fill('priya@settlecraft.local');
    await page.getByLabel('Amount in INR').fill('1');
    await page.getByRole('button', { name: 'Review payment', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm & send' }).click();
    await expect(page.getByRole('button', { name: 'Submitting safely…' })).toBeDisabled();
    await expect(page.locator('.payment-progress')).toBeVisible();
    await expect(page.getByText('Payment complete', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Transaction details' })).toBeVisible();
    await expect(page.locator('.outcome-label')).toHaveText(
      status === 'COMPLETED'
        ? 'Payment complete'
        : status === 'PENDING_REVIEW'
          ? 'Awaiting review'
          : 'Payment not completed',
    );
    expect(requests).toBe(1);
  });
}

test('mobile navigation traps focus, closes on Escape, and restores focus', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await login(page);
  const menu = page.getByRole('button', { name: 'Open navigation' });
  await menu.click();
  await expect(page.getByRole('button', { name: 'Close navigation' })).toBeFocused();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('.sidebar'))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  await expect(page.locator('.sidebar')).not.toHaveClass(/open/);
});

test('new outgoing ledger activity refreshes the balance without a credit toast', async ({
  page,
}) => {
  let debit = false;
  await page.route('**/api/v1/wallets/me/ledger-activity', (route) =>
    route.fulfill({
      json: debit
        ? [
            {
              id: 'new-debit',
              direction: 'DEBIT',
              amount: '100',
              kind: 'TRANSFER',
              created_at: new Date().toISOString(),
            },
          ]
        : [],
    }),
  );
  await page.route('**/api/v1/wallets/me', (route) =>
    route.fulfill({ json: { balance: debit ? '99900' : '100000', status: 'ACTIVE' } }),
  );
  await login(page);
  await expect(page.locator('.balance')).toContainText('₹1,000.00');
  debit = true;
  await expect(page.locator('.balance')).toContainText('₹999.00', { timeout: 12000 });
  await expect(page.locator('.payment-notification')).toHaveCount(0);
});

test('public forms fit small phones, landscape, and wide screens', async ({ page }) => {
  for (const width of [320, 375, 768, 1024, 1920]) {
    await page.setViewportSize({ width, height: width === 768 ? 375 : 900 });
    for (const path of ['/login', '/register']) {
      await page.goto(path);
      await expect(page.getByLabel('Email address')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      await page
        .getByRole('button', {
          name: path === '/login' ? 'Sign in' : 'Create account',
          exact: true,
        })
        .scrollIntoViewIfNeeded();
    }
  }
});
