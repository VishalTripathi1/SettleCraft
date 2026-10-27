import { Router, type Response, type CookieOptions } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import argon2 from 'argon2';
import { credentialsSchema, registerSchema } from '@settlecraft/shared';
import { env } from '../../config/env.js';
import { pool, transaction } from '../../db/pool.js';
import { ApiError } from '../../middleware/errors.js';
import { register, login, refresh, authenticate, digest, hashPassword } from './service.js';
import { audit } from '../ledger/service.js';
export const authRouter = Router();
const cookie: CookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  secure: env.NODE_ENV === 'production',
  path: '/api/v1/auth',
  maxAge: 7 * 86400000,
};
function respond(res: Response, result: Awaited<ReturnType<typeof login>>) {
  res.cookie('sc_refresh', result.refresh, cookie);
  res.json({ accessToken: result.accessToken, user: result.user });
}
const limit = rateLimit({
  windowMs: 15 * 60000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) =>
    res
      .status(429)
      .json({
        code: 'RATE_LIMITED',
        message: 'Too many attempts. Try again later.',
        requestId: res.locals.requestId,
      }),
});
authRouter.post('/register', limit, async (req, res) => {
  const data = registerSchema.parse(req.body);
  const result = await register(data, res.locals.requestId);
  res.status(201);
  respond(res, result);
});
authRouter.post('/login', limit, async (req, res) => {
  const data = credentialsSchema.parse(req.body);
  respond(res, await login(data.email, data.password));
});
const cookieOrigin: import('express').RequestHandler = (req, _res, next) => {
  if (req.get('origin') !== env.APP_ORIGIN || req.get('x-settlecraft-client') !== 'web')
    throw new ApiError(403, 'INVALID_ORIGIN', 'Refresh and logout require the same-origin client.');
  next();
};
authRouter.post('/refresh', cookieOrigin, async (req, res) => {
  respond(res, await refresh(req.cookies?.sc_refresh ?? ''));
});
authRouter.post('/logout', cookieOrigin, async (req, res) => {
  await pool.query('UPDATE refresh_sessions SET revoked_at=now() WHERE token_hash=$1', [
    digest(req.cookies?.sc_refresh ?? ''),
  ]);
  res.clearCookie('sc_refresh', cookie);
  res.status(204).end();
});
authRouter.get('/me', authenticate, (_req, res) => res.json(res.locals.user));
authRouter.post('/change-password', authenticate, async (req, res) => {
  const data = z
    .object({ currentPassword: z.string().max(128), newPassword: z.string().min(12).max(128) })
    .strict()
    .parse(req.body);
  const u = await pool.query<{ password_hash: string }>(
    'SELECT password_hash FROM users WHERE id=$1',
    [res.locals.user.id],
  );
  if (!(await argon2.verify(u.rows[0]!.password_hash, data.currentPassword)))
    throw new ApiError(400, 'WRONG_PASSWORD', 'Current password is incorrect.');
  const hash = await hashPassword(data.newPassword);
  await transaction(async (c) => {
    await c.query('UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2', [
      hash,
      res.locals.user.id,
    ]);
    await c.query('UPDATE refresh_sessions SET revoked_at=now() WHERE user_id=$1', [
      res.locals.user.id,
    ]);
    await audit(
      c,
      res.locals.user.id,
      'PASSWORD_CHANGED',
      res.locals.user.id,
      res.locals.requestId,
    );
  });
  res.clearCookie('sc_refresh', cookie);
  res.status(204).end();
});
