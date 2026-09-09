import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { listMyVouchers, redeemVoucher } from '../controllers/voucherController';

const router = Router();

router.use(requireAuth);
router.get('/me', listMyVouchers);
router.post('/:id/redeem', redeemVoucher);

export default router;
