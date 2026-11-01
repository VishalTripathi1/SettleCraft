import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { openapi } from './openapi.js';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { domainRouter } from './modules/transfers/routes.js';
import { authRouter } from './modules/auth/routes.js';
import { authenticate } from './modules/auth/service.js';
import { env } from './config/env.js';
import { ApiError } from './middleware/errors.js';
import { receive } from './modules/webhooks/service.js';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { pool } from './db/pool.js';
import { errors } from './middleware/errors.js';
export const logger = pino({ level: process.env.NODE_ENV === 'test' ? 'silent' : 'info' });
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cookieParser());
  app.use((req, res, next) => {
    res.locals.requestId = randomUUID();
    res.setHeader('X-Request-Id', res.locals.requestId);
    const start = performance.now();
    res.on('finish', () =>
      logger.info(
        {
          requestId: res.locals.requestId,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          ms: Math.round(performance.now() - start),
        },
        'request',
      ),
    );
    next();
  });
  app.post(
    '/api/v1/webhooks/demo-provider',
    express.text({ type: 'application/json', limit: '16kb' }),
    async (req, res) =>
      res.json(
        await receive(
          req.get('X-Webhook-Timestamp') ?? '',
          req.get('X-Webhook-Signature') ?? '',
          typeof req.body === 'string' ? req.body : '',
        ),
      ),
  );
  app.use(express.json({ limit: '16kb' }));
  app.use(
    '/api/v1',
    rateLimit({
      windowMs: 60000,
      limit: 300,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_req, res) =>
        res.status(429).json({
          code: 'RATE_LIMITED',
          message: 'Too many requests. Try again shortly.',
          requestId: res.locals.requestId,
        }),
    }),
  );
  app.use((req, _res, next) => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.get('origin') &&
      req.get('origin') !== env.APP_ORIGIN
    )
      throw new ApiError(403, 'INVALID_ORIGIN', 'Origin is not allowed.');
    next();
  });
  app.get('/api/v1/openapi.json', (_req, res) => res.json(openapi));
  app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(openapi));
  app.use('/api/v1/auth', authRouter);
  app.get('/api/v1/wallets/me', authenticate, async (_req, res) => {
    const r = await pool.query('SELECT * FROM wallet_spendable_balances WHERE owner_id=$1', [
      res.locals.user.id,
    ]);
    res.json(r.rows[0]);
  });
  app.get('/api/v1/health/live', (_req, res) =>
    res.json({ status: 'ok', service: 'SettleCraft API' }),
  );
  app.get('/api/v1/health/ready', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', database: 'connected' });
    } catch {
      res.status(503).json({
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database is unavailable.',
        requestId: res.locals.requestId,
      });
    }
  });
  app.use('/api/v1', domainRouter);
  app.use((_req, res) =>
    res
      .status(404)
      .json({ code: 'NOT_FOUND', message: 'Route not found.', requestId: res.locals.requestId }),
  );
  app.use(errors);
  return app;
}
