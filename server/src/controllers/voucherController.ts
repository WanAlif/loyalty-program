import { Request, Response } from 'express';
import prisma from '../lib/prisma';

export async function listMyVouchers(req: Request, res: Response) {
  const vouchers = await prisma.voucher.findMany({
    where: { userId: req.user!.userId },
    orderBy: { issuedAt: 'desc' },
    include: { receipt: { select: { orderId: true, amount: true } } },
  });

  return res.json({ vouchers });
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
