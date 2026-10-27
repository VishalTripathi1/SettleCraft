import type { User } from '@settlecraft/shared';
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
let token: string | null = null;
let refreshing: Promise<{ user: User; accessToken: string } | null> | null = null;
export function setToken(value: string | null) {
  token = value;
}
export async function refreshSession() {
  if (!refreshing)
    refreshing = (async () => {
      const r = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-SettleCraft-Client': 'web' },
      });
      if (r.status === 401) {
        token = null;
        return null;
      }
      if (!r.ok) throw new Error('Could not restore your session.');
      const data = (await r.json()) as { user: User; accessToken: string };
      token = data.accessToken;
      return data;
    })().finally(() => {
      refreshing = null;
    });
  return refreshing;
}
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; key?: string; retryAuth?: boolean } = {},
): Promise<T> {
  const request = () =>
    fetch(`/api/v1${path}`, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-SettleCraft-Client': 'web',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.key ? { 'Idempotency-Key': options.key } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  let r = await request();
  if (r.status === 401 && options.retryAuth !== false && !path.startsWith('/auth/')) {
    const session = await refreshSession();
    if (session) r = await request();
  }
  if (!r.ok) {
    const error = await r
      .json()
      .catch(() => ({ code: 'NETWORK_ERROR', message: 'Request failed. Please try again.' }));
    throw new ApiError(r.status, error.code, error.message);
  }
  if (r.status === 204) return undefined as T;
  return r.json() as Promise<T>;
}
export function money(paise: string | number | bigint) {
  const n = BigInt(paise);
  const abs = n < 0n ? -n : n;
  const whole = abs / 100n;
  const part = (abs % 100n).toString().padStart(2, '0');
  return `${n < 0n ? '−' : ''}₹${new Intl.NumberFormat('en-IN').format(whole)}.${part}`;
}
export function date(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
export type Transfer = {
  id: string;
  sender_id: string;
  recipient_id: string;
  sender_name: string;
  recipient_name: string;
  amount: string;
  note: string;
  reference: string;
  status: string;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
  journal_id: string | null;
};
export type List = { items: Transfer[]; total: number; page: number; pageSize: number };
export type Topup = {
  id: string;
  user_id: string;
  name?: string;
  amount: string;
  status: string;
  created_at: string;
  rationale?: string;
};
