import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { listMyVouchers, getMyVoucherStats, redeemVoucher } from '../controllers/voucherController';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

router.use(requireAuth);
router.get('/me', asyncHandler(listMyVouchers));
router.get('/me/stats', asyncHandler(getMyVoucherStats));
router.post('/:id/redeem', asyncHandler(redeemVoucher));

export default router;
