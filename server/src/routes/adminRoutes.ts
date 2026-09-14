import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { listReceipts, approveReceipt, rejectReceipt, deleteReceipt, getStats } from '../controllers/adminController';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/stats', asyncHandler(getStats));
router.get('/receipts', asyncHandler(listReceipts));
router.post('/receipts/:id/approve', asyncHandler(approveReceipt));
router.post('/receipts/:id/reject', asyncHandler(rejectReceipt));
router.delete('/receipts/:id', asyncHandler(deleteReceipt));

export default router;
