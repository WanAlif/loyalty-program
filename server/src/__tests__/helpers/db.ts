import prisma from '../../lib/prisma';

// Wipes all app tables between tests, in FK-safe order (children
// before parents), so each test starts from a clean, predictable
// database state instead of depending on leftover rows from earlier
// tests or previous runs.
export async function resetDb() {
  await prisma.voucher.deleteMany();
  await prisma.receipt.deleteMany();
  await prisma.user.deleteMany();
}

export async function disconnectDb() {
  await prisma.$disconnect();
}
