import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { listReceipts, approveReceipt, rejectReceipt } from '../controllers/adminController';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/receipts', listReceipts);
router.post('/receipts/:id/approve', approveReceipt);
router.post('/receipts/:id/reject', rejectReceipt);

export default router;
