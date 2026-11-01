import { mkdirSync } from 'node:fs';
import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
const base = 'http://127.0.0.1:5174';
async function api(context: APIRequestContext, token: string, path: string, body?: unknown) {
  const r = await context.fetch(`${base}/api/v1${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': randomUUID() },
    ...(body === undefined ? {} : { data: body }),
  });
  expect(r.ok(), `${path}: ${await r.text()}`).toBe(true);
  return r.json();
}
async function send(page: Page, email: string, amount: string) {
  await page.goto('/app/send');
  await page.getByLabel('Recipient email').fill(email);
  await page.getByLabel('Amount in INR').fill(amount);
  await page.getByRole('button', { name: 'Review payment', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm & send', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Transaction details', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Payment complete', { exact: true })).toBeVisible();
  return page.url().split('/').at(-1)!;
}
test('user request approval, both histories, direct admin reversal, rejection and reconciliation', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120000);
  const recipientContext = await browser.newContext(),
    adminContext = await browser.newContext();
  const recipient = await recipientContext.newPage(),
    admin = await adminContext.newPage();
  const suffix = randomUUID(),
    email = `sender-${suffix}@e2e.local`,
    recipientEmail = `recipient-${suffix}@e2e.local`;
  const senderAuth = await (
    await page.request.post(`${base}/api/v1/auth/register`, {
      data: { name: 'Reversal Sender', email, password: 'SettleCraft-e2e-1234!' },
    })
  ).json();
  const recipientAuth = await (
    await recipient.request.post(`${base}/api/v1/auth/register`, {
      data: {
        name: 'Reversal Recipient',
        email: recipientEmail,
        password: 'SettleCraft-e2e-1234!',
      },
    })
  ).json();
  const adminAuth = await (
    await admin.request.post(`${base}/api/v1/auth/login`, {
      data: {
        email: 'admin@settlecraft.local',
        password: process.env.DEMO_PASSWORD ?? 'SettleCraft-demo-2026!',
      },
    })
  ).json();
  // Navigating restores a rotating session and revokes its previous access token.
  for (const [p, credentials] of [
    [page, senderAuth],
    [recipient, recipientAuth],
    [admin, adminAuth],
  ] as const)
    p.on('response', async (response) => {
      if (response.url().endsWith('/auth/refresh') && response.ok())
        credentials.accessToken = (await response.json()).accessToken;
    });
  const funding = await api(page.request, senderAuth.accessToken, '/wallets/me/demo-topups', {
    amount: '2000',
  });
  await api(admin.request, adminAuth.accessToken, `/admin/topups/${funding.id}`, {
    decision: 'APPROVE',
    rationale: 'Fund reversal acceptance test',
  });
  const transferId = await send(page, recipientEmail, '1000');
  const original = await api(page.request, senderAuth.accessToken, `/transfers/${transferId}`);
  for (const [context, token] of [
    [page.request, senderAuth.accessToken],
    [recipient.request, recipientAuth.accessToken],
  ] as const) {
    const h = await api(context, token, '/history');
    expect(h.items).toHaveLength(1);
    expect(h.items[0].id).toBe(transferId);
  }
  await page.getByRole('button', { name: 'Request reversal', exact: true }).click();
  await page.getByLabel('Reversal reason').selectOption('MISTAKE');
  await page.getByRole('button', { name: 'Submit request', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(
    await page
      .getByLabel('Explanation')
      .evaluate((el: HTMLTextAreaElement) => el.validity.valueMissing),
  ).toBe(true);
  await page.getByLabel('Explanation').fill('Please correct this mistaken payment.');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Submit request', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByText('pending', { exact: true })).toBeVisible();
  expect((await api(page.request, senderAuth.accessToken, '/wallets/me')).balance).toBe('100000');
  expect((await api(recipient.request, recipientAuth.accessToken, '/wallets/me')).balance).toBe(
    '100000',
  );
  await admin.goto(`${base}/admin/reversal-requests`);
  await admin.getByLabel('Search requests').fill(original.reference);
  await admin.getByRole('link', { name: 'View request', exact: true }).click();
  await expect(admin.getByRole('heading', { name: 'Reversal request', exact: true })).toBeVisible();
  const requestId = admin.url().split('/').at(-1)!;
  expect((await new AxeBuilder({ page: admin }).analyze()).violations).toEqual([]);
  await admin.getByRole('button', { name: 'Approve reversal', exact: true }).click();
  await admin
    .getByLabel('Reason for this decision')
    .fill('Approved after checking the correction request');
  await admin.getByRole('button', { name: 'Confirm reversal', exact: true }).click();
  await expect(admin.getByRole('dialog')).toBeHidden();
  await expect(admin.getByRole('link', { name: 'View completed reversal' })).toBeVisible();
  const approved = await api(
    admin.request,
    adminAuth.accessToken,
    `/admin/reversal-requests/${requestId}`,
  );
  expect(approved.status).toBe('APPROVED');
  expect(approved.reversal_id).toBeTruthy();
  expect(
    approved.audits.some((a: { action: string }) => a.action === 'REVERSAL_REQUEST_APPROVED'),
  ).toBe(true);
  await api(
    admin.request,
    adminAuth.accessToken,
    `/admin/reversal-requests/${requestId}/decision`,
    { decision: 'APPROVE', rationale: 'Retry after lost approval response' },
  );
  expect((await api(page.request, senderAuth.accessToken, '/wallets/me')).balance).toBe('200000');
  expect((await api(recipient.request, recipientAuth.accessToken, '/wallets/me')).balance).toBe(
    '0',
  );
  for (const [p, label, token] of [
    [page, 'Reversal received', senderAuth],
    [recipient, 'Reversal sent', recipientAuth],
  ] as const) {
    await p.goto(`${base}/app/transactions`);
    await expect(p.getByText(new RegExp(label))).toBeVisible();
    await expect(p.locator('tbody tr')).toHaveCount(2);
    expect((await api(p.request, token.accessToken, '/history')).total).toBe(2);
  }
  await page.goto('/app/dashboard');
  await expect(page.getByText(/Reversal received/)).toBeVisible();
  await page.goto(`/app/reversals/${approved.reversal_id}`);
  await expect(page.getByRole('heading', { name: 'Reversal details' })).toBeVisible();
  await expect(page.getByText('DEBIT', { exact: true })).toBeVisible();
  await page.screenshot({ path: `test-results/reversal-${info.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  // Independent direct admin reversal remains available.
  const directId = await send(page, recipientEmail, '100');
  await admin.goto(`${base}/admin/transactions/${directId}`);
  await admin.getByRole('button', { name: 'Review reversal', exact: true }).click();
  await admin.getByLabel('Reason', { exact: true }).fill('Direct administrator correction');
  await admin.getByRole('button', { name: 'Confirm full reversal', exact: true }).click();
  await expect(admin.getByText('Fully reversed', { exact: true })).toBeVisible();
  expect((await api(page.request, senderAuth.accessToken, '/history?type=REVERSAL')).total).toBe(2);
  // A rejection closes the request without changing balances or adding a reversal.
  const rejectedId = await send(page, recipientEmail, '100');
  await page.getByRole('button', { name: 'Request reversal', exact: true }).click();
  await page.getByLabel('Explanation').fill('Please review this payment correction.');
  await page.getByRole('button', { name: 'Submit request', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  const pending = (
    await api(page.request, senderAuth.accessToken, `/transfers/${rejectedId}/reversal-requests`)
  ).items[0];
  await admin.goto(`${base}/admin/reversal-requests/${pending.id}`);
  await admin.getByRole('button', { name: 'Reject request', exact: true }).click();
  await admin.getByLabel('Reason for this decision').fill('No supporting evidence for reversal');
  await admin.getByRole('button', { name: 'Confirm rejection', exact: true }).click();
  await expect(admin.getByRole('dialog')).toBeHidden();
  await page.goto(`/app/reversal-requests/${pending.id}`);
  await expect(
    page.getByText('No supporting evidence for reversal', { exact: true }),
  ).toBeVisible();
  expect((await api(page.request, senderAuth.accessToken, '/wallets/me')).balance).toBe('190000');
  expect((await api(recipient.request, recipientAuth.accessToken, '/wallets/me')).balance).toBe(
    '10000',
  );
  expect(
    (await api(admin.request, adminAuth.accessToken, '/admin/reconciliation/run', {})).passed,
  ).toBe(true);
  await recipientContext.close();
  await adminContext.close();
});

test('email verification UI handles delivery, wrong code and confirmed outcome (mocked mail flow)', async ({
  page,
}) => {
  const auth = await (
    await page.request.post(`${base}/api/v1/auth/login`, {
      data: {
        email: 'rahul@settlecraft.local',
        password: process.env.DEMO_PASSWORD ?? 'SettleCraft-demo-2026!',
      },
    })
  ).json();
  let completed = false;
  const detail = () => ({
    id: 'otp-ui',
    sender_id: auth.user.id,
    recipient_id: 'recipient',
    sender_name: 'Rahul',
    recipient_name: 'Priya',
    amount: '1000000',
    note: 'Email verification UX test',
    reference: 'SC-OTP-UI',
    status: completed ? 'COMPLETED' : 'PENDING_VERIFICATION',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    journal_id: completed ? 'journal' : null,
    entries: completed
      ? [
          { direction: 'DEBIT', amount: '1000000' },
          { direction: 'CREDIT', amount: '1000000' },
        ]
      : [],
    reversals: [],
    decisions: [],
    risk: null,
    reversal_eligible: false,
    reversal_request_eligible: false,
  });
  await page.route('**/api/v1/transfers/otp-ui', (route) => route.fulfill({ json: detail() }));
  await page.route('**/api/v1/transfers/otp-ui/reversal-requests', (route) =>
    route.fulfill({ json: { items: [], total: 0, page: 1 } }),
  );
  await page.route('**/api/v1/transfers/otp-ui/verification/send', (route) =>
    route.fulfill({ json: { message: 'Code sent', expiresIn: 300, retryAfter: 60 } }),
  );
  await page.route('**/api/v1/transfers/otp-ui/verification/confirm', async (route) => {
    if (route.request().postDataJSON().code !== '123456')
      return route.fulfill({
        status: 422,
        json: {
          code: 'OTP_INVALID',
          message: 'Incorrect code. Please check your email and try again.',
        },
      });
    completed = true;
    return route.fulfill({ json: detail() });
  });
  await page.goto('/app/transactions/otp-ui');
  await expect(page.getByText('Awaiting verification', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Send verification code', exact: true }).click();
  await expect(page.getByText(/Code sent. Check your inbox/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Resend in/ })).toBeDisabled();
  await page.getByLabel('Email verification code').fill('000000');
  await page.getByRole('button', { name: 'Verify & complete payment', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Incorrect code');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByLabel('Email verification code').fill('123456');
  await page.getByRole('button', { name: 'Verify & complete payment', exact: true }).click();
  await expect(page.getByText('Payment complete', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Verify your payment' })).toHaveCount(0);
});

test('approved refund waits for incoming funds and settles through the running worker', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(90000);
  const receiverContext = await browser.newContext({ viewport: page.viewportSize()! }),
    adminContext = await browser.newContext({ viewport: page.viewportSize()! });
  const receiver = await receiverContext.newPage(),
    admin = await adminContext.newPage();
  const suffix = randomUUID(),
    email = `queue-sender-${suffix}@e2e.local`,
    receiverEmail = `queue-recipient-${suffix}@e2e.local`;
  const senderAuth = await (
    await page.request.post(`${base}/api/v1/auth/register`, {
      data: { name: 'Queue Sender', email, password: 'SettleCraft-e2e-1234!' },
    })
  ).json();
  const receiverAuth = await (
    await receiver.request.post(`${base}/api/v1/auth/register`, {
      data: { name: 'Queue Recipient', email: receiverEmail, password: 'SettleCraft-e2e-1234!' },
    })
  ).json();
  const adminAuth = await (
    await admin.request.post(`${base}/api/v1/auth/login`, {
      data: {
        email: 'admin@settlecraft.local',
        password: process.env.DEMO_PASSWORD ?? 'SettleCraft-demo-2026!',
      },
    })
  ).json();
  for (const [p, credentials] of [
    [page, senderAuth],
    [receiver, receiverAuth],
    [admin, adminAuth],
  ] as const)
    p.on('response', async (response) => {
      if (response.url().endsWith('/auth/refresh') && response.ok())
        credentials.accessToken = (await response.json()).accessToken;
    });
  const funding = await api(page.request, senderAuth.accessToken, '/wallets/me/demo-topups', {
    amount: '2000',
  });
  await api(admin.request, adminAuth.accessToken, `/admin/topups/${funding.id}`, {
    decision: 'APPROVE',
    rationale: 'Fund queued refund browser test',
  });
  const t = await api(page.request, senderAuth.accessToken, '/transfers', {
    recipientId: receiverAuth.user.id,
    amount: '1000',
    currency: 'INR',
    note: '',
  });
  await api(receiver.request, receiverAuth.accessToken, '/transfers', {
    recipientId: senderAuth.user.id,
    amount: '1000',
    currency: 'INR',
    note: 'Spend before reversal request',
  });
  await page.goto(`/app/transactions/${t.id}`);
  await page.getByRole('button', { name: 'Request reversal', exact: true }).click();
  await page
    .getByLabel('Explanation')
    .fill('Please refund this mistaken transaction when funds are available.');
  await page.getByRole('button', { name: 'Submit request', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  const r = (
    await api(page.request, senderAuth.accessToken, `/transfers/${t.id}/reversal-requests`)
  ).items[0];
  await admin.goto(`${base}/admin/reversal-requests/${r.id}`);
  await admin.getByRole('button', { name: 'Approve reversal', exact: true }).click();
  await admin
    .getByLabel('Reason for this decision')
    .fill('Authorized refund once sufficient funds arrive');
  await admin.getByRole('button', { name: 'Confirm reversal', exact: true }).click();
  await expect(admin.getByRole('dialog')).toBeHidden();
  await expect(admin.getByText('Authorized · waiting for funds', { exact: true })).toBeVisible();
  const counts = await api(admin.request, adminAuth.accessToken, '/admin/request-counts');
  expect(counts.reversal_queued).toBeGreaterThan(0);
  const mobileMenu = admin.getByRole('button', { name: 'Open navigation', exact: true });
  if (await mobileMenu.isVisible()) {
    await mobileMenu.click();
    await expect(admin.locator('.sidebar')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  }
  const badge = admin.locator('nav a[href="/admin/reversal-requests"] .nav-count');
  await expect(badge).toBeVisible();
  expect(Number(await badge.textContent())).toBeGreaterThan(0);
  mkdirSync('.local/ui-review', { recursive: true });
  await admin.screenshot({
    path: `.local/ui-review/queued-sidebar-${info.project.name}.png`,
    fullPage: false,
    animations: 'disabled',
  });
  if (await admin.getByRole('button', { name: 'Close navigation', exact: true }).isVisible())
    await admin.getByRole('button', { name: 'Close navigation', exact: true }).click();
  const partial = await api(receiver.request, receiverAuth.accessToken, '/wallets/me/demo-topups', {
    amount: '500',
  });
  await api(admin.request, adminAuth.accessToken, `/admin/topups/${partial.id}`, {
    decision: 'APPROVE',
    rationale: 'Partial funding for queued refund',
  });
  await receiver.goto(`${base}/app/dashboard`);
  await expect(receiver.locator('.balance')).toContainText('₹0.00');
  await expect(receiver.locator('.wallet-reservation')).toContainText('₹500.00 reserved');
  await receiver.screenshot({
    path: `.local/ui-review/queued-wallet-${info.project.name}.png`,
    fullPage: true,
  });
  expect(
    (await api(page.request, senderAuth.accessToken, `/reversal-requests/${r.id}`)).status,
  ).toBe('QUEUED');
  const rest = await api(receiver.request, receiverAuth.accessToken, '/wallets/me/demo-topups', {
    amount: '500',
  });
  await api(admin.request, adminAuth.accessToken, `/admin/topups/${rest.id}`, {
    decision: 'APPROVE',
    rationale: 'Remaining funds for queued refund',
  });
  await expect
    .poll(
      async () =>
        (await api(page.request, senderAuth.accessToken, `/reversal-requests/${r.id}`)).status,
      { timeout: 12000 },
    )
    .toBe('APPROVED');
  const receiverWallet = await api(receiver.request, receiverAuth.accessToken, '/wallets/me');
  expect(receiverWallet.balance).toBe('0');
  expect(receiverWallet.reserved_balance).toBe('0');
  expect((await api(page.request, senderAuth.accessToken, '/wallets/me')).balance).toBe('300000');
  await expect(admin.getByRole('link', { name: 'View completed reversal' })).toBeVisible({
    timeout: 10000,
  });
  expect(
    (await api(admin.request, adminAuth.accessToken, '/admin/reconciliation/run', {})).passed,
  ).toBe(true);
  await receiverContext.close();
  await adminContext.close();
});

test('inactivity warning allows renewal and eventually signs out despite background polling', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/login');
  await page.getByRole('button', { name: 'Rahul', exact: true }).click();
  const timing = page.waitForResponse((r) => r.url().endsWith('/auth/session') && r.ok());
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await timing;
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await page.clock.fastForward(14 * 60000 + 2000);
  await expect(page.getByText('Still there?', { exact: true })).toBeVisible();
  const renewed = page.waitForResponse((r) => r.url().endsWith('/auth/activity') && r.ok());
  await page.getByRole('button', { name: 'Stay signed in', exact: true }).click();
  await renewed;
  await expect(page.getByText('Still there?', { exact: true })).toHaveCount(0);
  await page.clock.fastForward(15 * 60000 + 2000);
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
  await expect(page.getByText(/You were signed out after being inactive/)).toBeVisible();
  await page.goto('/app/dashboard');
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
});
