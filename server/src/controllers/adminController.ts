import { Request, Response } from 'express';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import prisma from '../lib/prisma';
import { generateVoucherCode, calculateVoucherAmount, calculateExpiryDate } from '../lib/voucher';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

const listQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(5),
});

// GET /admin/stats — counts across all users, for the tab labels + tiles.
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

// POST /admin/receipts/:id/approve — flips to APPROVED + issues a voucher, atomically.
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

  // Segregation of duties: the account approving a receipt must not be
  // the account that submitted it — otherwise the one role with the
  // power to issue vouchers could pay itself out with no independent
  // check. requireUser on receiptRoutes already stops an admin from
  // submitting in the first place; this is the second, load-bearing
  // layer in case that ever changes or a receipt's ownership is
  // reassigned some other way.
  if (receipt.userId === adminId) {
    return res.status(403).json({ error: 'Cannot approve a receipt you submitted yourself' });
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

// POST /admin/receipts/:id/reject — flips to REJECTED, with an optional reason.
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

  // Same segregation-of-duties guard as approveReceipt — kept here too so
  // self-review isn't just blocked on the "yes" path.
  if (receipt.userId === adminId) {
    return res.status(403).json({ error: 'Cannot review a receipt you submitted yourself' });
  }

  const updated = await prisma.receipt.update({
    where: { id: receiptId },
    data: { status: 'REJECTED', reviewedAt: new Date(), reviewedBy: adminId, rejectionReason: parsed.data.reason },
  });

  return res.json({ receipt: updated });
}

// DELETE /admin/receipts/:id — removes a receipt (+ its voucher, if any).
export async function deleteReceipt(req: Request, res: Response) {
  const receiptId = req.params.id;

  const receipt = await prisma.receipt.findUnique({
    where: { id: receiptId },
    include: { voucher: true },
  });

  if (!receipt) {
    return res.status(404).json({ error: 'Receipt not found' });
  }

  // A receipt whose voucher has already been redeemed represents a real,
  // completed transaction — deleting it would destroy that audit trail.
  // Deletion is meant for cleaning up a receipt (test data, a mistaken
  // upload, a rejected/pending one), not for reversing a reward that's
  // already been claimed. An issued-but-unredeemed voucher is still fair
  // game — the admin action that created it is simply being undone.
  if (receipt.voucher?.redeemedAt) {
    return res.status(409).json({
      error: "Cannot delete — this receipt's voucher has already been redeemed",
    });
  }

  await prisma.$transaction(async (tx) => {
    if (receipt.voucher) {
      await tx.voucher.delete({ where: { id: receipt.voucher.id } });
    }
    await tx.receipt.delete({ where: { id: receiptId } });
  });

  // Best-effort cleanup of the uploaded file on disk — a file that's
  // already missing (or fails to delete for some other reason) shouldn't
  // block the receipt/voucher deletion from having already succeeded.
  const filename = receipt.fileUrl.split('/').pop();
  if (filename) {
    await fs.unlink(path.join(UPLOAD_DIR, filename)).catch(() => {});
  }

  return res.status(204).send();
}
