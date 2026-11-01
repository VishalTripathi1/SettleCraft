import { beforeAll, afterAll, it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { pool } from '../src/db/pool.js';
const app = createApp();
beforeAll(migrate);
afterAll(() => pool.end());
it('registers an empty wallet, rotates refresh tokens, detects replay, and revokes access', async () => {
  const email = `${randomUUID()}@test.local`;
  const registered = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'Test User', email, password: 'test-password-1234' });
  expect(registered.status).toBe(201);
  const token = registered.body.accessToken;
  const oldCookie = registered.headers['set-cookie']!;
  const wallet = await request(app)
    .get('/api/v1/wallets/me')
    .set('Authorization', `Bearer ${token}`);
  expect(wallet.body.balance).toBe('0');
  const duplicate = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'Test User', email, password: 'test-password-1234' });
  expect(duplicate.status).toBe(409);
  const csrf = await request(app).post('/api/v1/auth/refresh').set('Cookie', oldCookie);
  expect(csrf.status).toBe(403);
  const rotated = await request(app)
    .post('/api/v1/auth/refresh')
    .set('Cookie', oldCookie)
    .set('Origin', 'http://127.0.0.1:5173')
    .set('X-SettleCraft-Client', 'web');
  expect(rotated.status).toBe(200);
  const replay = await request(app)
    .post('/api/v1/auth/refresh')
    .set('Cookie', oldCookie)
    .set('Origin', 'http://127.0.0.1:5173')
    .set('X-SettleCraft-Client', 'web');
  expect(replay.status).toBe(401);
  expect(
    (
      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${rotated.body.accessToken}`)
    ).status,
  ).toBe(401);
});
it('rejects passwords and role injection', async () => {
  expect(
    (
      await request(app).post('/api/v1/auth/register').send({
        name: 'Test User',
        email: 'invalid@example.com',
        password: 'test-password-1234',
        role: 'ADMIN',
      })
    ).status,
  ).toBe(422);
  expect(
    (
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'missing@example.com', password: 'wrong-password-123' })
    ).status,
  ).toBe(401);
  expect((await request(app).get('/api/v1/wallets/me')).status).toBe(401);
});
it('expires inactive access and refresh sessions; polling cannot prolong them', async () => {
  const registered = await request(app)
    .post('/api/v1/auth/register')
    .send({
      name: 'Idle User',
      email: `${randomUUID()}@test.local`,
      password: 'test-password-1234',
    });
  const userId = registered.body.user.id,
    token = registered.body.accessToken,
    cookie = registered.headers['set-cookie']!;
  await pool.query(
    "UPDATE refresh_sessions SET last_activity_at=now()-interval '14 minutes' WHERE user_id=$1",
    [userId],
  );
  for (let i = 0; i < 3; i++)
    expect(
      (await request(app).get('/api/v1/wallets/me').set('Authorization', `Bearer ${token}`)).status,
    ).toBe(200);
  const timing = await request(app)
    .get('/api/v1/auth/session')
    .set('Authorization', `Bearer ${token}`);
  expect(timing.body.remainingMs).toBeLessThanOrEqual(60000);
  const refreshed = await request(app)
    .post('/api/v1/auth/refresh')
    .set('Cookie', cookie)
    .set('Origin', 'http://127.0.0.1:5173')
    .set('X-SettleCraft-Client', 'web');
  expect(refreshed.status).toBe(200);
  const preserved = await request(app)
    .get('/api/v1/auth/session')
    .set('Authorization', `Bearer ${refreshed.body.accessToken}`);
  expect(preserved.body.remainingMs).toBeLessThanOrEqual(60000);
  await pool.query(
    "UPDATE refresh_sessions SET last_activity_at=now()-interval '16 minutes' WHERE user_id=$1",
    [userId],
  );
  expect(
    (
      await request(app)
        .get('/api/v1/wallets/me')
        .set('Authorization', `Bearer ${refreshed.body.accessToken}`)
    ).status,
  ).toBe(401);
  expect(
    (
      await request(app)
        .post('/api/v1/auth/activity')
        .set('Authorization', `Bearer ${refreshed.body.accessToken}`)
    ).status,
  ).toBe(401);
  expect(
    (
      await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshed.headers['set-cookie']!)
        .set('Origin', 'http://127.0.0.1:5173')
        .set('X-SettleCraft-Client', 'web')
    ).status,
  ).toBe(401);
});
it('extends the idle deadline only through explicit authenticated foreground activity', async () => {
  const registered = await request(app)
    .post('/api/v1/auth/register')
    .send({
      name: 'Active User',
      email: `${randomUUID()}@test.local`,
      password: 'test-password-1234',
    });
  await pool.query(
    "UPDATE refresh_sessions SET last_activity_at=now()-interval '14 minutes' WHERE user_id=$1",
    [registered.body.user.id],
  );
  const active = await request(app)
    .post('/api/v1/auth/activity')
    .set('Authorization', `Bearer ${registered.body.accessToken}`);
  expect(active.status).toBe(200);
  expect(active.body.remainingMs).toBeGreaterThan(899000);
  expect(active.body.idleTimeoutMs).toBe(900000);
});
