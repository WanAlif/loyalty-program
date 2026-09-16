import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import authRoutes from './routes/authRoutes';
import receiptRoutes from './routes/receiptRoutes';
import adminRoutes from './routes/adminRoutes';
import voucherRoutes from './routes/voucherRoutes';
import prisma from './lib/prisma';
import { requireAuth } from './middleware/auth';
import { asyncHandler } from './lib/asyncHandler';

// Express app setup lives here, separate from index.ts's app.listen(),
// so tests (Supertest) can import and exercise the app directly without
// binding a real port.
export function createApp() {
  const app = express();
  const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

  // crossOriginResourcePolicy is relaxed to allow
  // the client (a different origin in local dev) to load uploaded
  // receipt files served from /uploads.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  // credentials: true + an explicit origin (not '*') is required for
  // httpOnly cookies to be sent/received cross-origin between the
  // React dev server and this API.
  app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  // served through this authenticated route instead of a public static 
  // otherwise anyone with the URL could view them, logged in or not.
  const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
  const SAFE_FILENAME = /^[a-zA-Z0-9-]+\.(jpg|jpeg|png|webp|pdf)$/i;

  app.get(
    '/uploads/:filename',
    requireAuth,
    asyncHandler(async (req, res) => {
      const { filename } = req.params;
      if (!SAFE_FILENAME.test(filename)) {
        return res.status(400).json({ error: 'Invalid file name' });
      }

      const receipt = await prisma.receipt.findFirst({ where: { fileUrl: `/uploads/${filename}` } });
      if (!receipt) {
        return res.status(404).json({ error: 'File not found' });
      }

      const isOwner = receipt.userId === req.user!.userId;
      const isAdmin = req.user!.role === 'ADMIN';
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: 'Not authorized to view this file' });
      }

      return res.sendFile(path.join(UPLOAD_DIR, filename));
    })
  );

  app.use('/api/auth', authRoutes);
  app.use('/api/receipts', receiptRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/vouchers', voucherRoutes);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Centralized error handler — keeps error shape consistent across routes.
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });

  return app;
}
