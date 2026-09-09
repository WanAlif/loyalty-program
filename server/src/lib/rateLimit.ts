import rateLimit from 'express-rate-limit';

// Skipped entirely during automated tests — Jest fires many login
// requests in quick succession across the suite, which isn't a brute
// force attempt, it's normal test traffic. Rate limiting is
// exercised by its own dedicated unit test instead (see
// __tests__/rateLimit.test.ts), which builds an isolated limiter
// instance rather than relying on this shared one.
const isTestEnv = process.env.NODE_ENV === 'test';

// Caps login attempts per IP — the key defense against password
// brute-forcing. 10 attempts per 15 minutes is generous enough for a
// real user who mistypes their password a few times, while making
// automated guessing impractically slow.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
  message: { error: 'Too many login attempts. Please try again later.' },
});

// Looser limit on registration — mainly to slow down automated mass
// account creation, not a security-critical path the way login is.
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
  message: { error: 'Too many accounts created from this address. Please try again later.' },
});
