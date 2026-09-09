import request from 'supertest';
import { createApp } from '../app';
import prisma from '../lib/prisma';
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

// Full setup: a user with an APPROVED receipt and its voucher, ready
// to redeem.
async function setupVoucher() {
  await createUser({ email: 'redeemer@test.com' });
  await createUser({ email: 'redeemadmin@test.com', role: 'ADMIN' });

  const userCookie = await loginAndGetCookie(app, 'redeemer@test.com');
  const adminCookie = await loginAndGetCookie(app, 'redeemadmin@test.com');

  const uploadRes = await request(app)
    .post('/api/receipts')
    .set('Cookie', userCookie)
    .field('orderId', 'ORD-VOUCHER-TEST')
    .field('purchaseDate', '2026-01-01')
    .field('amount', '100.00')
    .attach('file', testFileBuffer, testFileName);

  const approveRes = await request(app)
    .post(`/api/admin/receipts/${uploadRes.body.receipt.id}/approve`)
    .set('Cookie', adminCookie);

  return { userCookie, voucherId: approveRes.body.voucher.id as string };
}

describe('POST /api/vouchers/:id/redeem', () => {
  it('redeems an active voucher and stamps redeemedAt', async () => {
    const { userCookie, voucherId } = await setupVoucher();

    const res = await request(app).post(`/api/vouchers/${voucherId}/redeem`).set('Cookie', userCookie);

    expect(res.status).toBe(200);
    expect(res.body.voucher.redeemedAt).not.toBeNull();
  });

  it('rejects redeeming the same voucher twice', async () => {
    const { userCookie, voucherId } = await setupVoucher();

    await request(app).post(`/api/vouchers/${voucherId}/redeem`).set('Cookie', userCookie);
    const second = await request(app).post(`/api/vouchers/${voucherId}/redeem`).set('Cookie', userCookie);

    expect(second.status).toBe(409);
  });

  it('rejects redeeming an expired voucher', async () => {
    const { userCookie, voucherId } = await setupVoucher();

    // Backdate expiry directly via Prisma — real expiry is 90 days out,
    // not practical to wait for in a test.
    await prisma.voucher.update({
      where: { id: voucherId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(app).post(`/api/vouchers/${voucherId}/redeem`).set('Cookie', userCookie);

    expect(res.status).toBe(410);
  });

  it("rejects redeeming another user's voucher", async () => {
    const { voucherId } = await setupVoucher();
    await createUser({ email: 'intruder@test.com' });
    const intruderCookie = await loginAndGetCookie(app, 'intruder@test.com');

    const res = await request(app).post(`/api/vouchers/${voucherId}/redeem`).set('Cookie', intruderCookie);

    expect(res.status).toBe(404);
  });

  it('rejects an unauthenticated request', async () => {
    const { voucherId } = await setupVoucher();

    const res = await request(app).post(`/api/vouchers/${voucherId}/redeem`);

    expect(res.status).toBe(401);
  });
});
