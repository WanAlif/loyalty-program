import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/jwt';

const COOKIE_NAME = process.env.COOKIE_NAME || 'loyalty_token';

/**
 * Verifies the JWT stored in an httpOnly cookie and attaches the
 * decoded payload to req.user. Rejects with 401 if missing/invalid.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE_NAME];

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

/**
 * Must run after requireAuth. Rejects with 403 if the authenticated
 * user is not an ADMIN. Keeps admin-only routes enforced server-side,
 * independent of any frontend route guarding.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
