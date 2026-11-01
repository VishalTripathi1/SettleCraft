import { env } from '../../config/env.js';
import { ApiError } from '../../middleware/errors.js';
export function requireMail() {
  if (!env.BREVO_API_KEY || !env.MAIL_FROM)
    throw new ApiError(
      503,
      'EMAIL_NOT_CONFIGURED',
      'Email verification is not configured yet. Ask the operator to set up Brevo.',
    );
}
export async function sendCode(to: string, code: string, reference: string, amount: string) {
  requireMail();
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: {
        'api-key': env.BREVO_API_KEY!,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'SettleCraft', email: env.MAIL_FROM },
        to: [{ email: to }],
        subject: `Verify payment ${reference}`,
        textContent: `Your SettleCraft code is ${code}.\n\nAuthorize payment ${reference} for INR ${amount} (simulated funds). This code expires in 5 minutes and can be used once. Never share it. If you did not request this payment, do not enter the code.`,
      }),
    });
    if (!response.ok) throw new Error('Mail delivery rejected');
  } catch {
    // Provider errors can contain account information. Never expose or log the code or API key.
    throw new ApiError(
      503,
      'EMAIL_DELIVERY_FAILED',
      'The email provider could not accept the code. Please retry shortly.',
    );
  }
}
