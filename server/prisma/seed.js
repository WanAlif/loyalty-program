"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const prisma = new client_1.PrismaClient();
async function main() {
    const adminPasswordHash = await bcrypt_1.default.hash('Admin@12345', 10);
    const userPasswordHash = await bcrypt_1.default.hash('User@12345', 10);
    const admin = await prisma.user.upsert({
        where: { email: 'admin@loyalty.local' },
        update: {},
        create: {
            name: 'Admin',
            email: 'admin@loyalty.local',
            password: adminPasswordHash,
            role: client_1.Role.ADMIN,
        },
    });
    const demoUser = await prisma.user.upsert({
        where: { email: 'user@loyalty.local' },
        update: {},
        create: {
            name: 'Demo User',
            email: 'user@loyalty.local',
            password: userPasswordHash,
            role: client_1.Role.USER,
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
