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
