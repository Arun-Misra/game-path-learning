const { createHash, randomBytes } = require('node:crypto');

const SESSION_COOKIE = 'pathwise_session';
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 14;

function createSessionToken() {
  return randomBytes(32).toString('base64url');
}

function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION_MS,
  };
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

module.exports = {
  SESSION_COOKIE,
  SESSION_DURATION_MS,
  createSessionToken,
  hashSessionToken,
  cookieOptions,
  clearSessionCookie,
};
