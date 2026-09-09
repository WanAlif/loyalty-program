import request from 'supertest';
import { createApp } from '../app';
import { resetDb, disconnectDb } from './helpers/db';
import { createUser, loginAndGetCookie } from './helpers/auth';
import { testFileBuffer, testFileName } from './helpers/testFile';

const app = createApp();

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnectDb();
});

describe('POST /api/receipts', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/receipts')
      .field('orderId', 'ORD-1')
      .field('purchaseDate', '2026-01-01')
      .field('amount', '50.00')
      .attach('file', testFileBuffer, testFileName);

    expect(res.status).toBe(401);
  });

  it('creates a PENDING receipt for a logged-in user', async () => {
    await createUser({ email: 'uploader@test.com' });
    const cookie = await loginAndGetCookie(app, 'uploader@test.com');

    const res = await request(app)
      .post('/api/receipts')
      .set('Cookie', cookie)
      .field('orderId', 'ORD-1')
      .field('purchaseDate', '2026-01-01')
      .field('amount', '50.00')
      .attach('file', testFileBuffer, testFileName);

    expect(res.status).toBe(201);
    expect(res.body.receipt).toMatchObject({ orderId: 'ORD-1', status: 'PENDING' });
    expect(res.body.receipt.fileUrl).toMatch(/^\/uploads\//);
  });

  it('rejects an upload with no file attached', async () => {
    await createUser({ email: 'nofile@test.com' });
    const cookie = await loginAndGetCookie(app, 'nofile@test.com');

    const res = await request(app)
      .post('/api/receipts')
      .set('Cookie', cookie)
      .field('orderId', 'ORD-2')
      .field('purchaseDate', '2026-01-01')
      .field('amount', '50.00');

    expect(res.status).toBe(400);
  });

  it('rejects a non-positive amount', async () => {
    await createUser({ email: 'badamount@test.com' });
    const cookie = await loginAndGetCookie(app, 'badamount@test.com');

    const res = await request(app)
      .post('/api/receipts')
      .set('Cookie', cookie)
      .field('orderId', 'ORD-3')
      .field('purchaseDate', '2026-01-01')
      .field('amount', '-5')
      .attach('file', testFileBuffer, testFileName);

    expect(res.status).toBe(400);
  });
});

describe('GET /api/receipts/me', () => {
  it('only returns the logged-in user\'s own receipts', async () => {
    await createUser({ email: 'owner@test.com' });
    await createUser({ email: 'other@test.com' });

    const ownerCookie = await loginAndGetCookie(app, 'owner@test.com');
    const otherCookie = await loginAndGetCookie(app, 'other@test.com');

    await request(app)
      .post('/api/receipts')
      .set('Cookie', ownerCookie)
      .field('orderId', 'OWNER-ORDER')
      .field('purchaseDate', '2026-01-01')
      .field('amount', '20.00')
      .attach('file', testFileBuffer, testFileName);

    const res = await request(app).get('/api/receipts/me').set('Cookie', otherCookie);

    expect(res.status).toBe(200);
    expect(res.body.receipts).toHaveLength(0);
  });
});
