import express from 'express';
import request from 'supertest';
import rateLimit from 'express-rate-limit';

// The real loginLimiter/registerLimiter (lib/rateLimit.ts) are skipped
// under NODE_ENV=test so the rest of the suite isn't rate-limited by
// its own normal traffic. This test instead builds an isolated limiter
// with the same configuration shape but a tiny threshold, to verify the
// underlying rate-limiting behavior itself — that requests over the
// limit get a 429 — without touching the shared, test-skipped instance.
describe('rate limiting', () => {
  it('blocks requests once the limit is exceeded, and allows them again is not tested here (window not elapsed)', async () => {
    const app = express();
    const limiter = rateLimit({
      windowMs: 60 * 1000,
      limit: 3,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests' },
    });
    app.use('/test', limiter, (_req, res) => res.json({ ok: true }));

    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(await request(app).get('/test'));
    }

    const statuses = results.map((r) => r.status);
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses.slice(3)).toEqual([429, 429]);
    expect(results[4].body.error).toBe('Too many requests');
  });
});
