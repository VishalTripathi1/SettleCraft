import { afterEach, it, expect, vi } from 'vitest';
import { env } from '../src/config/env.js';
import { requireMail, sendCode } from '../src/modules/verification/mail.js';
vi.mock('../src/config/env.js', () => ({
  env: { BREVO_API_KEY: 'fake-test-key', MAIL_FROM: 'sender@example.com' },
}));
afterEach(() => vi.unstubAllGlobals());
it('uses the Brevo transactional endpoint and binds the email to the payment', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetch);
  await sendCode('payer@example.com', '123456', 'SC-TEST', '10000.00');
  expect(fetch.mock.calls[0]![0]).toBe('https://api.brevo.com/v3/smtp/email');
  const options = fetch.mock.calls[0]![1];
  const body = JSON.parse(options.body);
  expect(body.sender.email).toBe('sender@example.com');
  expect(body.to).toEqual([{ email: 'payer@example.com' }]);
  expect(body.textContent).toContain('123456');
  expect(body.textContent).toContain('SC-TEST');
  expect(body.textContent).toContain('10000.00');
});
it('fails closed without configuration and redacts provider error details', async () => {
  const old = env.BREVO_API_KEY;
  env.BREVO_API_KEY = undefined;
  expect(requireMail).toThrow('not configured');
  env.BREVO_API_KEY = old;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
  await expect(
    sendCode('payer@example.com', '123456', 'SC-TEST', '10000.00'),
  ).rejects.toMatchObject({ code: 'EMAIL_DELIVERY_FAILED' });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('secret provider response')));
  await expect(sendCode('payer@example.com', '123456', 'SC-TEST', '10000.00')).rejects.toThrow(
    'The email provider could not accept the code.',
  );
});
