import request from 'supertest';
import bcrypt from 'bcrypt';
import type { Express } from 'express';
import prisma from '../../lib/prisma';

export const TEST_PASSWORD = 'Password123';

// Creates a user directly via Prisma (bypassing the API) — useful for
// seeding an ADMIN, since there's no public "become admin" endpoint by
// design (see README: admin accounts are seed-only).
export async function createUser(overrides: { email: string; role?: 'USER' | 'ADMIN'; name?: string }) {
  const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);
  return prisma.user.create({
    data: {
      name: overrides.name ?? 'Test User',
      email: overrides.email,
      password: hashedPassword,
      role: overrides.role ?? 'USER',
    },
  });
}

// Logs in via the real API (exercising the login endpoint itself) and
// returns the Set-Cookie header value to reuse on subsequent requests.
export async function loginAndGetCookie(app: Express, identifier: string, password = TEST_PASSWORD) {
  const res = await request(app).post('/api/auth/login').send({ identifier, password });
  const cookie = res.headers['set-cookie'];
  if (!cookie) {
    throw new Error(`Login failed in test setup: ${JSON.stringify(res.body)}`);
  }
  return cookie;
}

// Same as loginAndGetCookie, but for the admin-only login endpoint.
export async function loginAdminAndGetCookie(app: Express, identifier: string, password = TEST_PASSWORD) {
  const res = await request(app).post('/api/auth/admin-login').send({ identifier, password });
  const cookie = res.headers['set-cookie'];
  if (!cookie) {
    throw new Error(`Admin login failed in test setup: ${JSON.stringify(res.body)}`);
  }
  return cookie;
}
