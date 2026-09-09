import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { receiptUpload } from '../lib/upload';
import { createReceipt, listMyReceipts, getMyReceiptStats, getMyReceiptById } from '../controllers/receiptController';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

router.use(requireAuth);

router.post('/', receiptUpload.single('file'), asyncHandler(createReceipt));
router.get('/me', asyncHandler(listMyReceipts));
router.get('/me/stats', asyncHandler(getMyReceiptStats));
router.get('/:id', asyncHandler(getMyReceiptById));

export default router;
