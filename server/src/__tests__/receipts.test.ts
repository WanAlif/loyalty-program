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
      .field('receiptNumber', '1001')
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
      .field('receiptNumber', '1001')
      .field('purchaseDate', '2026-01-01')
      .field('amount', '50.00')
      .attach('file', testFileBuffer, testFileName);

    expect(res.status).toBe(201);
    expect(res.body.receipt).toMatchObject({ orderId: 'ORD-1', receiptNumber: '1001', status: 'PENDING' });
    expect(res.body.receipt.fileUrl).toMatch(/^\/uploads\//);
  });

  it('rejects an upload with no file attached', async () => {
    await createUser({ email: 'nofile@test.com' });
    const cookie = await loginAndGetCookie(app, 'nofile@test.com');

    const res = await request(app)
      .post('/api/receipts')
      .set('Cookie', cookie)
      .field('orderId', 'ORD-2')
      .field('receiptNumber', '1002')
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
      .field('receiptNumber', '1003')
      .field('purchaseDate', '2026-01-01')
      .field('amount', '-5')
      .attach('file', testFileBuffer, testFileName);

    expect(res.status).toBe(400);
  });

  it('rejects an amount over RM 2000', async () => {
    await createUser({ email: 'overlimit@test.com' });
    const cookie = await loginAndGetCookie(app, 'overlimit@test.com');

    const res = await request(app)
      .post('/api/receipts')
      .set('Cookie', cookie)
      .field('orderId', 'ORD-OVERLIMIT')
      .field('receiptNumber', '1006')
      .field('purchaseDate', '2026-01-01')
      .field('amount', '2000.01')
      .attach('file', testFileBuffer, testFileName);

    expect(res.status).toBe(400);
  });

  it('accepts an amount exactly at the RM 2000 limit', async () => {
    await createUser({ email: 'atlimit@test.com' });
    const cookie = await loginAndGetCookie(app, 'atlimit@test.com');

    const res = await request(app)
      .post('/api/receipts')
      .set('Cookie', cookie)
      .field('orderId', 'ORD-ATLIMIT')
      .field('receiptNumber', '1007')
      .field('purchaseDate', '2026-01-01')
      .field('amount', '2000.00')
      .attach('file', testFileBuffer, testFileName);

    expect(res.status).toBe(201);
  });

  it('rejects a purchase date in the future', async () => {
    await createUser({ email: 'futuredate@test.com' });
    const cookie = await loginAndGetCookie(app, 'futuredate@test.com');

    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);

    const res = await request(app)
      .post('/api/receipts')
      .set('Cookie', cookie)
      .field('orderId', 'ORD-FUTURE')
      .field('receiptNumber', '1004')
      .field('purchaseDate', future.toISOString())
      .field('amount', '30.00')
      .attach('file', testFileBuffer, testFileName);

    expect(res.status).toBe(400);
  });

  it('rejects an order ID containing a space', async () => {
    await createUser({ email: 'spaceorder@test.com' });
    const cookie = await loginAndGetCookie(app, 'spaceorder@test.com');

    const res = await request(app)
      .post('/api/receipts')
      .set('Cookie', cookie)
      .field('orderId', 'ORD 123')
      .field('receiptNumber', '1005')
      .field('purchaseDate', '2026-01-01')
      .field('amount', '30.00')
      .attach('file', testFileBuffer, testFileName);

    expect(res.status).toBe(400);
  });

  it('rejects the same user submitting the same order ID twice', async () => {
    await createUser({ email: 'dupeorder@test.com' });
    const cookie = await loginAndGetCookie(app, 'dupeorder@test.com');

    const first = await request(app)
      .post('/api/receipts')
      .set('Cookie', cookie)
      .field('orderId', 'ORD-DUPE')
      .field('receiptNumber', '2001')
      .field('purchaseDate', '2026-01-01')
      .field('amount', '30.00')
      .attach('file', testFileBuffer, testFileName);
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/receipts')
      .set('Cookie', cookie)
      .field('orderId', 'ORD-DUPE')
      .field('receiptNumber', '2002')
      .field('purchaseDate', '2026-01-02')
      .field('amount', '30.00')
      .attach('file', testFileBuffer, testFileName);

    expect(second.status).toBe(409);
    expect(second.body.error).toMatch(/order ID/);
  });

  it('allows two different users to submit the same order ID', async () => {
    await createUser({ email: 'userA@test.com' });
    await createUser({ email: 'userB@test.com' });
    const cookieA = await loginAndGetCookie(app, 'userA@test.com');
    const cookieB = await loginAndGetCookie(app, 'userB@test.com');

    const resA = await request(app)
      .post('/api/receipts')
      .set('Cookie', cookieA)
      .field('orderId', 'ORD-SHARED')
      .field('receiptNumber', '3001')
      .field('purchaseDate', '2026-01-01')
      .field('amount', '30.00')
      .attach('file', testFileBuffer, testFileName);

    const resB = await request(app)
      .post('/api/receipts')
      .set('Cookie', cookieB)
      .field('orderId', 'ORD-SHARED')
      .field('receiptNumber', '3002')
      .field('purchaseDate', '2026-01-01')
      .field('amount', '30.00')
      .attach('file', testFileBuffer, testFileName);

    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
  });

  it('rejects a receipt ID containing letters', async () => {
    await createUser({ email: 'letterreceipt@test.com' });
    const cookie = await loginAndGetCookie(app, 'letterreceipt@test.com');

    const res = await request(app)
      .post('/api/receipts')
      .set('Cookie', cookie)
      .field('orderId', 'ORD-LETTERRECEIPT')
      .field('receiptNumber', 'RC12')
      .field('purchaseDate', '2026-01-01')
      .field('amount', '30.00')
      .attach('file', testFileBuffer, testFileName);

    expect(res.status).toBe(400);
  });

  it('rejects a receipt ID with fewer than 4 digits', async () => {
    await createUser({ email: 'shortreceipt@test.com' });
    const cookie = await loginAndGetCookie(app, 'shortreceipt@test.com');

    const res = await request(app)
      .post('/api/receipts')
      .set('Cookie', cookie)
      .field('orderId', 'ORD-SHORTRECEIPT')
      .field('receiptNumber', '123')
      .field('purchaseDate', '2026-01-01')
      .field('amount', '30.00')
      .attach('file', testFileBuffer, testFileName);

    expect(res.status).toBe(400);
  });

  it('rejects a receipt ID with more than 4 digits', async () => {
    await createUser({ email: 'longreceipt@test.com' });
    const cookie = await loginAndGetCookie(app, 'longreceipt@test.com');

    const res = await request(app)
      .post('/api/receipts')
      .set('Cookie', cookie)
      .field('orderId', 'ORD-LONGRECEIPT')
      .field('receiptNumber', '12345')
      .field('purchaseDate', '2026-01-01')
      .field('amount', '30.00')
      .attach('file', testFileBuffer, testFileName);

    expect(res.status).toBe(400);
  });

  it('rejects a receipt ID containing a space', async () => {
    await createUser({ email: 'spacereceipt@test.com' });
    const cookie = await loginAndGetCookie(app, 'spacereceipt@test.com');

    const res = await request(app)
      .post('/api/receipts')
      .set('Cookie', cookie)
      .field('orderId', 'ORD-SPACERECEIPT')
      .field('receiptNumber', '12 3')
      .field('purchaseDate', '2026-01-01')
      .field('amount', '30.00')
      .attach('file', testFileBuffer, testFileName);

    expect(res.status).toBe(400);
  });

  it('rejects the same user submitting the same receipt ID twice', async () => {
    await createUser({ email: 'dupereceipt@test.com' });
    const cookie = await loginAndGetCookie(app, 'dupereceipt@test.com');

    const first = await request(app)
      .post('/api/receipts')
      .set('Cookie', cookie)
      .field('orderId', 'ORD-DUPERECEIPT-1')
      .field('receiptNumber', '4001')
      .field('purchaseDate', '2026-01-01')
      .field('amount', '30.00')
      .attach('file', testFileBuffer, testFileName);
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/receipts')
      .set('Cookie', cookie)
      .field('orderId', 'ORD-DUPERECEIPT-2')
      .field('receiptNumber', '4001')
      .field('purchaseDate', '2026-01-02')
      .field('amount', '30.00')
      .attach('file', testFileBuffer, testFileName);

    expect(second.status).toBe(409);
    expect(second.body.error).toMatch(/receipt ID/);
  });

  it('allows two different users to submit the same receipt ID', async () => {
    await createUser({ email: 'receiptUserA@test.com' });
    await createUser({ email: 'receiptUserB@test.com' });
    const cookieA = await loginAndGetCookie(app, 'receiptUserA@test.com');
    const cookieB = await loginAndGetCookie(app, 'receiptUserB@test.com');

    const resA = await request(app)
      .post('/api/receipts')
      .set('Cookie', cookieA)
      .field('orderId', 'ORD-RECEIPT-SHARED-A')
      .field('receiptNumber', '5001')
      .field('purchaseDate', '2026-01-01')
      .field('amount', '30.00')
      .attach('file', testFileBuffer, testFileName);

    const resB = await request(app)
      .post('/api/receipts')
      .set('Cookie', cookieB)
      .field('orderId', 'ORD-RECEIPT-SHARED-B')
      .field('receiptNumber', '5001')
      .field('purchaseDate', '2026-01-01')
      .field('amount', '30.00')
      .attach('file', testFileBuffer, testFileName);

    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
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
      .field('receiptNumber', '6001')
      .field('purchaseDate', '2026-01-01')
      .field('amount', '20.00')
      .attach('file', testFileBuffer, testFileName);

    const res = await request(app).get('/api/receipts/me').set('Cookie', otherCookie);

    expect(res.status).toBe(200);
    expect(res.body.receipts).toHaveLength(0);
  });
});
