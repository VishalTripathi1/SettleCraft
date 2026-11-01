import { randomBytes, randomUUID, createHash } from 'node:crypto';
import argon2 from 'argon2';
import { SignJWT, jwtVerify } from 'jose';
import type { RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import type { User } from '@settlecraft/shared';
import { env } from '../../config/env.js';
import { pool, transaction } from '../../db/pool.js';
import { ApiError } from '../../middleware/errors.js';
import { provision, audit } from '../ledger/service.js';
export const digest = (v: string) => createHash('sha256').update(v).digest('hex');
const secret = new TextEncoder().encode(env.JWT_SECRET);
export const hashPassword = (password: string) =>
  argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
export async function session(
  c: PoolClient,
  user: User,
  family: string = randomUUID(),
  lastActivity?: Date,
) {
  const refresh = randomBytes(48).toString('base64url');
  const id = randomUUID();
  await c.query(
    "INSERT INTO refresh_sessions(id,user_id,token_hash,family_id,expires_at,last_activity_at) VALUES($1,$2,$3,$4,now()+interval '7 days',COALESCE($5::timestamptz,now()))",
    [id, user.id, digest(refresh), family, lastActivity ?? null],
  );
  const accessToken = await new SignJWT({ sid: id })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuer('settlecraft')
    .setAudience('settlecraft-web')
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(secret);
  return { accessToken, refresh, user };
}
export async function register(
  data: { name: string; email: string; password: string },
  requestId: string,
) {
  const hash = await hashPassword(data.password);
  try {
    return await transaction(async (c) => {
      const result = await c.query<User>(
        'INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name,email,role',
        [data.name, data.email, hash],
      );
      const user = result.rows[0]!;
      await provision(c, user.id);
      await audit(c, user.id, 'REGISTER', user.id, requestId);
      return session(c, user);
    });
  } catch (e) {
    if ((e as { code?: string }).code === '23505')
      throw new ApiError(409, 'EMAIL_EXISTS', 'An account with this email already exists.');
    throw e;
  }
}
export async function login(email: string, password: string) {
  const result = await pool.query<User & { password_hash: string; status: string }>(
    'SELECT id,name,email,role,password_hash,status FROM users WHERE email=$1',
    [email],
  );
  const row = result.rows[0];
  // A valid fallback hash keeps non-existent-account checks expensive too.
  const hash = row?.password_hash ?? (await hashPassword('unavailable-account-password'));
  const valid = await argon2.verify(hash, password);
  if (!row || !valid || row.status !== 'ACTIVE')
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  const user: User = { id: row.id, name: row.name, email: row.email, role: row.role };
  return transaction((c) => session(c, user));
}
export async function refresh(token: string) {
  const result = await transaction(async (c) => {
    const r = await c.query<{
      id: string;
      user_id: string;
      family_id: string;
      revoked_at: string | null;
      expired: boolean;
      last_activity_at: Date;
    }>(
      "SELECT *,expires_at<now() OR last_activity_at<=now()-($2::int*interval '1 minute') AS expired FROM refresh_sessions WHERE token_hash=$1 FOR UPDATE",
      [digest(token), env.SESSION_IDLE_MINUTES],
    );
    const old = r.rows[0];
    if (!old) return null;
    if (old.revoked_at || old.expired) {
      await c.query(
        'UPDATE refresh_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE family_id=$1',
        [old.family_id],
      );
      return null;
    }
    const u = await c.query<User>(
      "SELECT id,name,email,role FROM users WHERE id=$1 AND status='ACTIVE'",
      [old.user_id],
    );
    if (!u.rows[0]) return null;
    await c.query('UPDATE refresh_sessions SET revoked_at=now() WHERE id=$1', [old.id]);
    return session(c, u.rows[0], old.family_id, old.last_activity_at);
  });
  if (!result) throw new ApiError(401, 'SESSION_EXPIRED', 'Please sign in again.');
  return result;
}
export const authenticate: RequestHandler = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new Error();
    const { payload } = await jwtVerify(token, secret, {
      issuer: 'settlecraft',
      audience: 'settlecraft-web',
      algorithms: ['HS256'],
    });
    const u = await pool.query<User>(
      "SELECT u.id,u.name,u.email,u.role FROM users u JOIN refresh_sessions s ON s.user_id=u.id WHERE u.id=$1 AND s.id=$2 AND s.revoked_at IS NULL AND s.expires_at>now() AND s.last_activity_at>now()-($3::int*interval '1 minute') AND u.status='ACTIVE'",
      [payload.sub, payload.sid, env.SESSION_IDLE_MINUTES],
    );
    if (!u.rows[0]) throw new Error();
    res.locals.user = u.rows[0];
    res.locals.sessionId = payload.sid;
    next();
  } catch {
    next(new ApiError(401, 'UNAUTHENTICATED', 'Please sign in to continue.'));
  }
};
export const admin: RequestHandler = (_req, res, next) => {
  if (res.locals.user?.role !== 'ADMIN')
    return next(new ApiError(403, 'FORBIDDEN', 'Administrator access required.'));
  next();
};
