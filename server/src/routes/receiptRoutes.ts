import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { receiptUpload } from '../lib/upload';
import { createReceipt, listMyReceipts, getMyReceiptById } from '../controllers/receiptController';

const router = Router();

router.use(requireAuth);

router.post('/', receiptUpload.single('file'), createReceipt);
router.get('/me', listMyReceipts);
router.get('/:id', getMyReceiptById);

export default router;
