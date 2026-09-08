import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/authRoutes';
import receiptRoutes from './routes/receiptRoutes';
import adminRoutes from './routes/adminRoutes';
import voucherRoutes from './routes/voucherRoutes';

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// credentials: true + an explicit origin (not '*') is required for
// httpOnly cookies to be sent/received cross-origin between the
// React dev server and this API.
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Static serving for uploaded receipt files (local disk storage).
app.use('/uploads', express.static('uploads'));

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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
