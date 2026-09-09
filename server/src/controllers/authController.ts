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

// Malaysian mobile/phone numbers: digits only, no '+', no spaces, no dashes.
// Must start with the local trunk prefix '0' or the country code '60',
// e.g. 0123456789 or 60123456789. Length is capped so the whole string
// (including a leading '60') never exceeds 13 digits.
const PHONE_REGEX = /^(?:60|0)[0-9]{7,11}$/;
const PHONE_ERROR =
  'Phone number must contain digits only (no +, spaces, or letters), starting with 0 or 60, e.g. 0123456789 or 60123456789';

// At least one of email/phone is required — not something Prisma can
// enforce at the schema level, so it's validated here.
const registerSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email().optional(),
    phone: z.string().regex(PHONE_REGEX, PHONE_ERROR).optional(),
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

// Same "at least one of email/phone" rule as registration — a profile
// update can't leave the account with neither contact method.
const updateProfileSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().regex(PHONE_REGEX, PHONE_ERROR).optional().or(z.literal('')),
  })
  .transform((data) => ({
    name: data.name,
    email: data.email === '' ? undefined : data.email,
    phone: data.phone === '' ? undefined : data.phone,
  }))
  .refine((data) => data.email || data.phone, {
    message: 'Either email or phone is required',
    path: ['email'],
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

// Shared by both /auth/login and /auth/admin-login. `allowedRole`
// scopes which accounts are even considered a match — a user account
// hitting the admin endpoint (or vice versa) is treated exactly like a
// wrong password: same generic message, same 401, no hint that the
// account exists but is the wrong kind. This is a deliberate, real
// access boundary (not just a frontend redirect) — the regular login
// endpoint will never issue a session for an admin account, and the
// admin login endpoint will never issue one for a regular user account.
async function authenticateAndRespond(req: Request, res: Response, allowedRole: 'USER' | 'ADMIN') {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }

  const { identifier, password } = parsed.data;

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier }, { phone: identifier }] },
  });

  if (!user || user.role !== allowedRole) {
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

export async function login(req: Request, res: Response) {
  return authenticateAndRespond(req, res, 'USER');
}

export async function adminLogin(req: Request, res: Response) {
  return authenticateAndRespond(req, res, 'ADMIN');
}

export async function logout(_req: Request, res: Response) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: isProduction, sameSite: 'lax' });
  return res.status(204).send();
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

export async function changePassword(req: Request, res: Response) {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }

  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const currentMatches = await bcrypt.compare(currentPassword, user.password);
  if (!currentMatches) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashedPassword },
  });

  return res.status(204).send();
}

export async function updateProfile(req: Request, res: Response) {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }

  const { name, email, phone } = parsed.data;

  try {
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { name, email: email ?? null, phone: phone ?? null },
      select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true },
    });

    return res.json({ user });
  } catch (err: any) {
    // P2002 = unique constraint violation — another account already
    // uses this email or phone number.
    if (err?.code === 'P2002') {
      return res.status(409).json({ error: 'That email or phone number is already in use' });
    }
    throw err;
  }
}

export async function getCurrentUser(req: Request, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true },
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  return res.json({ user });
}
