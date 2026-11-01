import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { issueCode, verifyCode } from './service.js';
export const verificationRouter = Router();
const limiter = rateLimit({
  windowMs: 60000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({
      code: 'RATE_LIMITED',
      message: 'Too many verification attempts. Try again shortly.',
      requestId: res.locals.requestId,
    }),
});
verificationRouter.post('/transfers/:id/verification/send', limiter, async (req, res) =>
  res.json(
    await issueCode(res.locals.user.id, z.uuid().parse(req.params.id), res.locals.requestId),
  ),
);
verificationRouter.post('/transfers/:id/verification/confirm', limiter, async (req, res) =>
  res.json(
    await verifyCode(
      res.locals.user.id,
      z.uuid().parse(req.params.id),
      req.body,
      res.locals.requestId,
    ),
  ),
);
