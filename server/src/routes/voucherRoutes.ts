import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { listMyVouchers } from '../controllers/voucherController';

const router = Router();

router.use(requireAuth);
router.get('/me', listMyVouchers);

export default router;
