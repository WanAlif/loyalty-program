import { Request, Response } from 'express';
import { z } from 'zod';
import fs from 'fs/promises';
import prisma from '../lib/prisma';

const createReceiptSchema = z.object({
  orderId: z
    .string()
    .min(1, 'Order ID is required')
    .refine((v) => !/\s/.test(v), 'Order ID cannot contain spaces'),
  // A 4-digit numeric code — no letters, no spaces, no punctuation.
  receiptNumber: z
    .string()
    .regex(/^\d{4}$/, 'Receipt ID must be a 4 digit number'),
  purchaseDate: z
    .string()
    .refine((v) => !isNaN(Date.parse(v)), 'Invalid purchase date')
    .refine((v) => new Date(v) <= new Date(), 'Purchase date cannot be in the future'),
  amount: z
    .string()
    .refine((v) => !isNaN(Number(v)) && Number(v) > 0, 'Amount must be a positive number')
    .refine((v) => Number(v) <= 2000, 'Amount cannot exceed RM 2000'),
});

export async function createReceipt(req: Request, res: Response) {
  const parsed = createReceiptSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'Receipt file is required' });
  }

  const { orderId, receiptNumber, purchaseDate, amount } = parsed.data;

  try {
    const receipt = await prisma.receipt.create({
      data: {
        userId: req.user!.userId,
        orderId,
        receiptNumber,
        purchaseDate: new Date(purchaseDate),
        amount,
        fileUrl: `/uploads/${req.file.filename}`,
      },
    });

    return res.status(201).json({ receipt });
  } catch (err: any) {
    // P2002 = unique constraint violation — this user already has a
    // receipt with this orderId or this receiptNumber
    // (@@unique([userId, orderId]) / @@unique([userId, receiptNumber])).
    // Different users CAN share either value; this only blocks the same
    // user resubmitting the same order/receipt to farm multiple
    // vouchers off one purchase. Prisma's error names which field(s)
    // collided in `meta.target`, so the message can be specific rather
    // than a generic "something duplicate" — falls back to the order ID
    // wording if that detail isn't available for some reason.
    if (err?.code === 'P2002') {
      // Multer already wrote the file to disk before this failed —
      // clean it up so a rejected upload doesn't leave an orphaned file.
      await fs.unlink(req.file.path).catch(() => {});
      const target: string[] = err?.meta?.target ?? [];
      const field = target.includes('receiptNumber') ? 'receipt ID' : 'order ID';
      return res.status(409).json({ error: `You have already submitted a receipt for this ${field}` });
    }
    throw err;
  }
}

const listMyReceiptsQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(5),
});

export async function listMyReceipts(req: Request, res: Response) {
  const parsed = listMyReceiptsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid query parameters' });
  }

  const { status, page, limit } = parsed.data;
  const where = { userId: req.user!.userId, ...(status ? { status } : {}) };
  const skip = (page - 1) * limit;

  const [receipts, total] = await Promise.all([
    prisma.receipt.findMany({
      where,
      orderBy: { submittedAt: 'desc' },
      include: { voucher: true },
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

// Status counts for the current user's own receipts — powers the
// ALL/PENDING/APPROVED/REJECTED tab labels on the user dashboard
// without needing to fetch every receipt just to count them.
export async function getMyReceiptStats(req: Request, res: Response) {
  const userId = req.user!.userId;
  const [pending, approved, rejected] = await Promise.all([
    prisma.receipt.count({ where: { userId, status: 'PENDING' } }),
    prisma.receipt.count({ where: { userId, status: 'APPROVED' } }),
    prisma.receipt.count({ where: { userId, status: 'REJECTED' } }),
  ]);

  return res.json({
    stats: {
      pendingReceipts: pending,
      approvedReceipts: approved,
      rejectedReceipts: rejected,
      totalReceipts: pending + approved + rejected,
    },
  });
}

export async function getMyReceiptById(req: Request, res: Response) {
  const receipt = await prisma.receipt.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
    include: { voucher: true },
  });

  if (!receipt) {
    return res.status(404).json({ error: 'Receipt not found' });
  }

  return res.json({ receipt });
}
