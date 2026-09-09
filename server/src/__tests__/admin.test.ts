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

// Shared setup: a regular user with one PENDING receipt, and an admin
// session to review it. Returns everything a test needs.
async function setupPendingReceipt(amount = '100.00') {
  await createUser({ email: 'buyer@test.com' });
  await createUser({ email: 'admin@test.com', role: 'ADMIN' });

  const userCookie = await loginAndGetCookie(app, 'buyer@test.com');
  const adminCookie = await loginAndGetCookie(app, 'admin@test.com');

  const uploadRes = await request(app)
    .post('/api/receipts')
    .set('Cookie', userCookie)
    .field('orderId', 'ORD-ADMIN-TEST')
    .field('purchaseDate', '2026-01-01')
    .field('amount', amount)
    .attach('file', testFileBuffer, testFileName);

  return { userCookie, adminCookie, receiptId: uploadRes.body.receipt.id as string };
}

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

  it('blocks a non-admin user from approving receipts', async () => {
    const { userCookie, receiptId } = await setupPendingReceipt();

    const res = await request(app)
      .post(`/api/admin/receipts/${receiptId}/approve`)
      .set('Cookie', userCookie);

    expect(res.status).toBe(403);
  });

  it('returns 404 for a non-existent receipt id', async () => {
    await createUser({ email: 'admin2@test.com', role: 'ADMIN' });
    const adminCookie = await loginAndGetCookie(app, 'admin2@test.com');

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
