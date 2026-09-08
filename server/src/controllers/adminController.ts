import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { generateVoucherCode, calculateVoucherAmount, calculateExpiryDate } from '../lib/voucher';

const listQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
});

export async function listReceipts(req: Request, res: Response) {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid status filter' });
  }

  const receipts = await prisma.receipt.findMany({
    where: parsed.data.status ? { status: parsed.data.status } : undefined,
    orderBy: { submittedAt: 'desc' },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      voucher: true,
    },
  });

  return res.json({ receipts });
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
