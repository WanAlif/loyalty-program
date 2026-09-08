import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { signToken } from '../lib/jwt';

const COOKIE_NAME = process.env.COOKIE_NAME || 'loyalty_token';
const isProduction = process.env.NODE_ENV === 'production';

const cookieOptions = {
  httpOnly: true,
  secure: isProduction, // requires HTTPS in production; fine over http in local dev
  sameSite: 'lax' as const,
  maxAge: 30 * 60 * 1000, // 30 minutes, matches JWT_EXPIRES_IN
};

// At least one of email/phone is required — not something Prisma can
// enforce at the schema level, so it's validated here.
const registerSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email().optional(),
    phone: z.string().min(6).optional(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  })
  .refine((data) => data.email || data.phone, {
    message: 'Either email or phone is required',
    path: ['email'],
  });

const loginSchema = z.object({
  identifier: z.string().min(1, 'Email or phone is required'),
  password: z.string().min(1, 'Password is required'),
});

export async function register(req: Request, res: Response) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }

  const { name, email, phone, password } = parsed.data;

  const existing = await prisma.user.findFirst({
    where: {
      OR: [email ? { email } : undefined, phone ? { phone } : undefined].filter(
        Boolean
      ) as any,
    },
  });

  if (existing) {
    return res.status(409).json({ error: 'An account with this email or phone already exists' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: { name, email, phone, password: hashedPassword },
  });

  const token = signToken({ userId: user.id, role: user.role });
  res.cookie(COOKIE_NAME, token, cookieOptions);

  return res.status(201).json({
    user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role },
  });
}

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }

  const { identifier, password } = parsed.data;

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier }, { phone: identifier }] },
  });

  // Same error for "no such user" and "wrong password" — avoids
  // revealing whether an account exists.
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const passwordMatches = await bcrypt.compare(password, user.password);
  if (!passwordMatches) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = signToken({ userId: user.id, role: user.role });
  res.cookie(COOKIE_NAME, token, cookieOptions);

  return res.json({
    user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role },
  });
}

export async function logout(_req: Request, res: Response) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: isProduction, sameSite: 'lax' });
  return res.status(204).send();
}

export async function me(req: Request, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true },
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  return res.json({ user });
}
