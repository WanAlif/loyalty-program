import { PrismaClient } from '@prisma/client';

// Reuse a single PrismaClient instance across the app (and across
// hot-reloads in dev) to avoid exhausting the DB connection pool.
const prisma = new PrismaClient();

export default prisma;
