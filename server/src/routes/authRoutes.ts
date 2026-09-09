import { Router } from 'express';
import { register, login, adminLogin, logout, getCurrentUser, updateProfile, changePassword } from '../controllers/authController';
import { requireAuth } from '../middleware/auth';
import { loginLimiter, registerLimiter } from '../lib/rateLimit';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

router.post('/register', registerLimiter, asyncHandler(register));
router.post('/login', loginLimiter, asyncHandler(login));
router.post('/admin-login', loginLimiter, asyncHandler(adminLogin));
router.post('/logout', asyncHandler(logout));
router.get('/me', requireAuth, asyncHandler(getCurrentUser));
router.patch('/me', requireAuth, asyncHandler(updateProfile));
router.post('/change-password', requireAuth, asyncHandler(changePassword));

export default router;
