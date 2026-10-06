const { prisma } = require('../lib/prisma');
const { SESSION_COOKIE, hashSessionToken } = require('../lib/session');

async function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[SESSION_COOKIE];

  if (!token) {
    return res.status(401).json({
      error: { code: 'UNAUTHENTICATED', message: 'Please sign in to continue.' },
    });
  }

  try {
    const session = await prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        user: { select: { id: true, email: true, name: true } },
      },
    });

    if (!session || session.expiresAt <= new Date()) {
      if (session) {
        await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      }
      res.clearCookie(SESSION_COOKIE, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      });
      return res.status(401).json({
        error: { code: 'SESSION_EXPIRED', message: 'Your session has expired. Please sign in again.' },
      });
    }

    req.user = session.user;
    req.sessionId = session.id;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { requireAuth };
