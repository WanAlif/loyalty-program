import { Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';

// Voucher "status" (ACTIVE / REDEEMED / EXPIRED) isn't a stored column —
// it's derived from redeemedAt/expiresAt (see voucherStatus below and
// its mirror in the client). These helpers translate the same three
// derived states into a Prisma `where` clause so filtering and stats
// can be computed in the database instead of pulling every voucher over
// the wire just to bucket them in JS.
const VOUCHER_FILTER_STATUSES = ['AVAILABLE', 'REDEEMED', 'EXPIRED'] as const;
type VoucherFilterStatus = (typeof VOUCHER_FILTER_STATUSES)[number];

function voucherStatusWhere(status: VoucherFilterStatus, now: Date): Prisma.VoucherWhereInput {
  switch (status) {
    case 'REDEEMED':
      return { redeemedAt: { not: null } };
    case 'EXPIRED':
      return { redeemedAt: null, expiresAt: { lt: now } };
    case 'AVAILABLE':
      return { redeemedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] };
  }
}

const listMyVouchersQuerySchema = z.object({
  status: z.enum(VOUCHER_FILTER_STATUSES).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(5),
});

export async function listMyVouchers(req: Request, res: Response) {
  const parsed = listMyVouchersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid query parameters' });
  }

  const { status, page, limit } = parsed.data;
  const userId = req.user!.userId;
  const where: Prisma.VoucherWhereInput = {
    userId,
    ...(status ? voucherStatusWhere(status, new Date()) : {}),
  };
  const skip = (page - 1) * limit;

  const [vouchers, total] = await Promise.all([
    prisma.voucher.findMany({
      where,
      orderBy: { issuedAt: 'desc' },
      include: { receipt: { select: { orderId: true, amount: true } } },
      skip,
      take: limit,
    }),
    prisma.voucher.count({ where }),
  ]);

  return res.json({
    vouchers,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
}

// Status counts for the current user's own vouchers — powers the
// ALL/AVAILABLE/REDEEMED/EXPIRED tab labels on the vouchers page (and
// the "available vouchers" stat tile on the dashboard) without
// fetching every voucher just to count them.
export async function getMyVoucherStats(req: Request, res: Response) {
  const userId = req.user!.userId;
  const now = new Date();
  const [available, redeemed, expired] = await Promise.all([
    prisma.voucher.count({ where: { userId, ...voucherStatusWhere('AVAILABLE', now) } }),
    prisma.voucher.count({ where: { userId, ...voucherStatusWhere('REDEEMED', now) } }),
    prisma.voucher.count({ where: { userId, ...voucherStatusWhere('EXPIRED', now) } }),
  ]);

  return res.json({
    stats: {
      availableVouchers: available,
      redeemedVouchers: redeemed,
      expiredVouchers: expired,
      totalVouchers: available + redeemed + expired,
    },
  });
}

export async function redeemVoucher(req: Request, res: Response) {
  const voucher = await prisma.voucher.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
  });

  if (!voucher) {
    return res.status(404).json({ error: 'Voucher not found' });
  }

  if (voucher.redeemedAt) {
    return res.status(409).json({ error: 'Voucher has already been redeemed' });
  }

  if (voucher.expiresAt && voucher.expiresAt < new Date()) {
    return res.status(410).json({ error: 'Voucher has expired' });
  }

  const updated = await prisma.voucher.update({
    where: { id: voucher.id },
    data: { redeemedAt: new Date() },
  });

  return res.json({ voucher: updated });
}
