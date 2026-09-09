import request from 'supertest';
import { createApp } from '../app';
import prisma from '../lib/prisma';
import { resetDb, disconnectDb } from './helpers/db';
import { createUser, loginAndGetCookie, loginAdminAndGetCookie } from './helpers/auth';
import { testFileBuffer, testFileName } from './helpers/testFile';

const app = createApp();

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnectDb();
});

// Shared setup: a regular user with one PENDING receipt, and an admin
// session to review it. Returns everything a test needs.
async function setupPendingReceipt(amount = '100.00') {
  await createUser({ email: 'buyer@test.com' });
  await createUser({ email: 'admin@test.com', role: 'ADMIN' });

  const userCookie = await loginAndGetCookie(app, 'buyer@test.com');
  const adminCookie = await loginAdminAndGetCookie(app, 'admin@test.com');

  const uploadRes = await request(app)
    .post('/api/receipts')
    .set('Cookie', userCookie)
    .field('orderId', 'ORD-ADMIN-TEST')
    .field('receiptNumber', '9001')
    .field('purchaseDate', '2026-01-01')
    .field('amount', amount)
    .attach('file', testFileBuffer, testFileName);

  return { userCookie, adminCookie, receiptId: uploadRes.body.receipt.id as string };
}

describe('GET /api/admin/stats', () => {
  it('blocks a non-admin user', async () => {
    await createUser({ email: 'statsuser@test.com' });
    const userCookie = await loginAndGetCookie(app, 'statsuser@test.com');

    const res = await request(app).get('/api/admin/stats').set('Cookie', userCookie);
    expect(res.status).toBe(403);
  });

  it('returns counts of receipts by status and total vouchers issued', async () => {
    await createUser({ email: 'statsadmin@test.com', role: 'ADMIN' });
    const adminCookie = await loginAdminAndGetCookie(app, 'statsadmin@test.com');

    // One receipt approved (-> one voucher), one rejected, one left pending.
    const { adminCookie: setupAdminCookie, receiptId: approvedId } = await setupPendingReceipt('50.00');
    await request(app).post(`/api/admin/receipts/${approvedId}/approve`).set('Cookie', setupAdminCookie);

    await createUser({ email: 'statsbuyer2@test.com' });
    const buyer2Cookie = await loginAndGetCookie(app, 'statsbuyer2@test.com');
    const rejectUpload = await request(app)
      .post('/api/receipts')
      .set('Cookie', buyer2Cookie)
      .field('orderId', 'ORD-STATS-REJECT')
      .field('receiptNumber', '9002')
      .field('purchaseDate', '2026-01-01')
      .field('amount', '20.00')
      .attach('file', testFileBuffer, testFileName);
    await request(app)
      .post(`/api/admin/receipts/${rejectUpload.body.receipt.id}/reject`)
      .set('Cookie', setupAdminCookie);

    await createUser({ email: 'statsbuyer3@test.com' });
    const buyer3Cookie = await loginAndGetCookie(app, 'statsbuyer3@test.com');
    await request(app)
      .post('/api/receipts')
      .set('Cookie', buyer3Cookie)
      .field('orderId', 'ORD-STATS-PENDING')
      .field('receiptNumber', '9003')
      .field('purchaseDate', '2026-01-01')
      .field('amount', '20.00')
      .attach('file', testFileBuffer, testFileName);

    const res = await request(app).get('/api/admin/stats').set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.stats).toMatchObject({
      pendingReceipts: 1,
      approvedReceipts: 1,
      rejectedReceipts: 1,
      totalReceipts: 3,
      vouchersIssued: 1,
    });
  });
});

describe('POST /api/admin/receipts/:id/approve', () => {
  it('approves a pending receipt and generates a voucher worth 10% of the amount', async () => {
    const { adminCookie, receiptId } = await setupPendingReceipt('100.00');

    const res = await request(app)
      .post(`/api/admin/receipts/${receiptId}/approve`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.receipt.status).toBe('APPROVED');
    expect(res.body.voucher).toBeDefined();
    expect(Number(res.body.voucher.amount)).toBeCloseTo(10.0);
    expect(res.body.voucher.code).toMatch(/^LP-/);
    expect(res.body.voucher.receiptId).toBe(receiptId);
  });

  it('rejects approving the same receipt twice', async () => {
    const { adminCookie, receiptId } = await setupPendingReceipt();

    const first = await request(app)
      .post(`/api/admin/receipts/${receiptId}/approve`)
      .set('Cookie', adminCookie);
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`/api/admin/receipts/${receiptId}/approve`)
      .set('Cookie', adminCookie);

    expect(second.status).toBe(409);
  });

  it('only creates one voucher when two approve requests race concurrently', async () => {
    const { adminCookie, receiptId } = await setupPendingReceipt();

    // Fire both at once (not awaited sequentially) to actually exercise
    // the race window between the early PENDING check and the
    // conditional update committing, rather than the trivially
    // sequential "approve twice" case above.
    const [first, second] = await Promise.all([
      request(app).post(`/api/admin/receipts/${receiptId}/approve`).set('Cookie', adminCookie),
      request(app).post(`/api/admin/receipts/${receiptId}/approve`).set('Cookie', adminCookie),
    ]);

    const statuses = [first.status, second.status].sort();
    // Exactly one wins with 200, the other loses the race with 409 —
    // never both 200 (double voucher) and never a 500 from an
    // unhandled P2025 on the losing request.
    expect(statuses).toEqual([200, 409]);

    const vouchers = await prisma.voucher.findMany({ where: { receiptId } });
    expect(vouchers).toHaveLength(1);
  });

  it('blocks a non-admin user from approving receipts', async () => {
    const { userCookie, receiptId } = await setupPendingReceipt();

    const res = await request(app)
      .post(`/api/admin/receipts/${receiptId}/approve`)
      .set('Cookie', userCookie);

    expect(res.status).toBe(403);
  });

  it('returns 404 for a non-existent receipt id', async () => {
    await createUser({ email: 'admin2@test.com', role: 'ADMIN' });
    const adminCookie = await loginAdminAndGetCookie(app, 'admin2@test.com');

    const res = await request(app)
      .post('/api/admin/receipts/00000000-0000-0000-0000-000000000000/approve')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/admin/receipts/:id/reject', () => {
  it('rejects a pending receipt with a reason and does not create a voucher', async () => {
    const { adminCookie, receiptId } = await setupPendingReceipt();

    const res = await request(app)
      .post(`/api/admin/receipts/${receiptId}/reject`)
      .set('Cookie', adminCookie)
      .send({ reason: 'Blurry image' });

    expect(res.status).toBe(200);
    expect(res.body.receipt.status).toBe('REJECTED');
    expect(res.body.receipt.rejectionReason).toBe('Blurry image');
  });

  it('rejects rejecting an already-reviewed receipt', async () => {
    const { adminCookie, receiptId } = await setupPendingReceipt();

    await request(app).post(`/api/admin/receipts/${receiptId}/approve`).set('Cookie', adminCookie);

    const res = await request(app)
      .post(`/api/admin/receipts/${receiptId}/reject`)
      .set('Cookie', adminCookie)
      .send({ reason: 'Too late' });

    expect(res.status).toBe(409);
  });
});
