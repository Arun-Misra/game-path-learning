const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { rateLimit } = require('express-rate-limit');
const { prisma } = require('../lib/prisma');
const {
  SESSION_COOKIE,
  SESSION_DURATION_MS,
  createSessionToken,
  hashSessionToken,
  cookieOptions,
  clearSessionCookie,
} = require('../lib/session');
const { requireAuth } = require('../middleware/require-auth');

const router = express.Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many authentication attempts. Try again later.' } },
});

const registerSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(10).max(128),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});

function validationError(res, error) {
  return res.status(400).json({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Please check the submitted information.',
      details: error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
    },
  });
}

async function issueSession(user, res) {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await prisma.session.create({
    data: { userId: user.id, tokenHash: hashSessionToken(token), expiresAt },
  });
  res.cookie(SESSION_COOKIE, token, cookieOptions());
  return { id: user.id, email: user.email, name: user.name };
}

router.post('/register', authLimiter, async (req, res, next) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await prisma.user.create({
      data: {
        email: parsed.data.email,
        name: parsed.data.name || null,
        passwordHash,
      },
      select: { id: true, email: true, name: true },
    });
    const safeUser = await issueSession(user, res);
    return res.status(201).json({ data: { user: safeUser } });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({
        error: { code: 'EMAIL_IN_USE', message: 'An account with this email already exists.' },
      });
    }
    return next(error);
  }
});

router.post('/login', authLimiter, async (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  try {
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    const valid = user && await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({
        error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' },
      });
    }

    const safeUser = await issueSession(user, res);
    return res.status(200).json({ data: { user: safeUser } });
  } catch (error) {
    return next(error);
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ data: { user: req.user } });
});

router.post('/logout', async (req, res, next) => {
  const token = req.cookies && req.cookies[SESSION_COOKIE];
  try {
    if (token) {
      await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
    }
    clearSessionCookie(res);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
