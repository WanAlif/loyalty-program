import { Router } from 'express';
import { requireAuth, requireUser } from '../middleware/auth';
import { listMyVouchers, getMyVoucherStats, redeemVoucher } from '../controllers/voucherController';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

router.use(requireAuth);
// Defense in depth — see receiptRoutes.ts: vouchers only exist because a
// receipt was approved, and admins shouldn't be holding receipts at all.
router.use(requireUser);
router.get('/me', asyncHandler(listMyVouchers));
router.get('/me/stats', asyncHandler(getMyVoucherStats));
router.post('/:id/redeem', asyncHandler(redeemVoucher));

export default router;
