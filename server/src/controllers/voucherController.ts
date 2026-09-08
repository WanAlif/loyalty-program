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
