import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const adminPasswordHash = await bcrypt.hash('Admin@12345', 10);
  const userPasswordHash = await bcrypt.hash('User@12345', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@loyalty.local' },
    update: {},
    create: {
      name: 'Admin',
      email: 'admin@loyalty.local',
      password: adminPasswordHash,
      role: Role.ADMIN,
    },
  });

  const demoUser = await prisma.user.upsert({
    where: { email: 'user@loyalty.local' },
    update: {},
    create: {
      name: 'Demo User',
      email: 'user@loyalty.local',
      password: userPasswordHash,
      role: Role.USER,
    },
  });

  console.log('Seeded admin:', admin.email);
  console.log('Seeded demo user:', demoUser.email);
  console.log('Admin login -> email: admin@loyalty.local | password: Admin@12345');
  console.log('User login  -> email: user@loyalty.local  | password: User@12345');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
