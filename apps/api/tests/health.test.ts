import { it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
it('serves liveness with a correlation ID and security headers', async () => {
  const res = await request(createApp()).get('/api/v1/health/live');
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('ok');
  expect(res.headers['x-request-id']).toBeTruthy();
  expect(res.headers['x-content-type-options']).toBe('nosniff');
});
it('returns standard missing-route errors', async () => {
  const res = await request(createApp()).get('/missing');
  expect(res.status).toBe(404);
  expect(res.body.code).toBe('NOT_FOUND');
});
