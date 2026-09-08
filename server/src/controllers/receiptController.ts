import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';

const createReceiptSchema = z.object({
  orderId: z.string().min(1, 'Order ID is required'),
  purchaseDate: z.string().refine((v) => !isNaN(Date.parse(v)), 'Invalid purchase date'),
  amount: z
    .string()
    .refine((v) => !isNaN(Number(v)) && Number(v) > 0, 'Amount must be a positive number'),
});

export async function createReceipt(req: Request, res: Response) {
  const parsed = createReceiptSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'Receipt file is required' });
  }

  const { orderId, purchaseDate, amount } = parsed.data;

  const receipt = await prisma.receipt.create({
    data: {
      userId: req.user!.userId,
      orderId,
      purchaseDate: new Date(purchaseDate),
      amount,
      fileUrl: `/uploads/${req.file.filename}`,
    },
  });

  return res.status(201).json({ receipt });
}

export async function listMyReceipts(req: Request, res: Response) {
  const receipts = await prisma.receipt.findMany({
    where: { userId: req.user!.userId },
    orderBy: { submittedAt: 'desc' },
    include: { voucher: true },
  });

  return res.json({ receipts });
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
