import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { generateVoucherCode, calculateVoucherAmount, calculateExpiryDate } from '../lib/voucher';

const listQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(5),
});

export async function getStats(_req: Request, res: Response) {
  const [pending, approved, rejected, vouchersIssued] = await Promise.all([
    prisma.receipt.count({ where: { status: 'PENDING' } }),
    prisma.receipt.count({ where: { status: 'APPROVED' } }),
    prisma.receipt.count({ where: { status: 'REJECTED' } }),
    prisma.voucher.count(),
  ]);

  return res.json({
    stats: {
      pendingReceipts: pending,
      approvedReceipts: approved,
      rejectedReceipts: rejected,
      totalReceipts: pending + approved + rejected,
      vouchersIssued,
    },
  });
}

export async function listReceipts(req: Request, res: Response) {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid query parameters' });
  }

  const { status, page, limit } = parsed.data;
  const where = status ? { status } : undefined;
  const skip = (page - 1) * limit;

  // Fetch the page and the total count in parallel — the count is what
  // lets the frontend render "Page 2 of 7" / disable Next on the last
  // page, without fetching every row just to know how many there are.
  const [receipts, total] = await Promise.all([
    prisma.receipt.findMany({
      where,
      orderBy: { submittedAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        voucher: true,
      },
      skip,
      take: limit,
    }),
    prisma.receipt.count({ where }),
  ]);

  return res.json({
    receipts,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
}

export async function approveReceipt(req: Request, res: Response) {
  const receiptId = req.params.id;
  const adminId = req.user!.userId;

  const receipt = await prisma.receipt.findUnique({ where: { id: receiptId } });

  if (!receipt) {
    return res.status(404).json({ error: 'Receipt not found' });
  }

  if (receipt.status !== 'PENDING') {
    return res.status(409).json({ error: `Receipt has already been ${receipt.status.toLowerCase()}` });
  }

  const voucherAmount = calculateVoucherAmount(Number(receipt.amount));
  const expiresAt = calculateExpiryDate();

  // Retry a couple of times on the rare chance of a code collision
  // (unique constraint on Voucher.code would otherwise throw).
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const updatedReceipt = await tx.receipt.update({
          where: { id: receiptId, status: 'PENDING' }, // guards against a concurrent double-approve
          data: { status: 'APPROVED', reviewedAt: new Date(), reviewedBy: adminId },
        });

        const voucher = await tx.voucher.create({
          data: {
            userId: receipt.userId,
            receiptId: receipt.id,
            code: generateVoucherCode(),
            amount: voucherAmount,
            expiresAt,
          },
        });

        return { receipt: updatedReceipt, voucher };
      });

      return res.status(200).json(result);
    } catch (err: any) {
      // P2025 = the conditional `where: { id, status: 'PENDING' }`
      // update matched no row — a concurrent request (a double-click,
      // or two admin tabs open on the same receipt) already approved
      // or rejected this receipt between our initial status check
      // above and this update actually committing. Same outcome the
      // early check would have given if it had lost that race by a
      // few milliseconds, so re-read the receipt and respond exactly
      // like the early check does, instead of a generic 500.
      if (err?.code === 'P2025') {
        const current = await prisma.receipt.findUnique({ where: { id: receiptId } });
        return res
          .status(409)
          .json({ error: `Receipt has already been ${(current?.status ?? 'reviewed').toLowerCase()}` });
      }

      lastError = err;
      // P2002 = unique constraint violation (voucher code collision, or
      // receiptId already has a voucher from a concurrent request).
      if (err?.code !== 'P2002') break;
    }
  }

  console.error(lastError);
  return res.status(500).json({ error: 'Failed to approve receipt, please try again' });
}

const rejectSchema = z.object({
  reason: z.string().min(1).optional(),
});

export async function rejectReceipt(req: Request, res: Response) {
  const receiptId = req.params.id;
  const adminId = req.user!.userId;

  const parsed = rejectSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const receipt = await prisma.receipt.findUnique({ where: { id: receiptId } });

  if (!receipt) {
    return res.status(404).json({ error: 'Receipt not found' });
  }

  if (receipt.status !== 'PENDING') {
    return res.status(409).json({ error: `Receipt has already been ${receipt.status.toLowerCase()}` });
  }

  const updated = await prisma.receipt.update({
    where: { id: receiptId },
    data: { status: 'REJECTED', reviewedAt: new Date(), reviewedBy: adminId, rejectionReason: parsed.data.reason },
  });

  return res.json({ receipt: updated });
}
