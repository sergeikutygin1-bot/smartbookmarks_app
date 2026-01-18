import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Create super admin user
  const email = 'admin@smartbookmarks.app';
  const password = 'Admin123!';

  console.log('Creating super admin user...');
  const passwordHash = await bcrypt.hash(password, 12);

  const adminUser = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      role: 'admin',
      emailVerified: true,
    },
    create: {
      email,
      passwordHash,
      role: 'admin',
      emailVerified: true,
    },
  });

  console.log(`✓ Super admin created: ${adminUser.email}`);
  console.log(`  ID: ${adminUser.id}`);
  console.log(`  Email: ${email}`);
  console.log(`  Password: ${password}`);
  console.log(`  Role: ${adminUser.role}`);

  return adminUser;
}

main()
  .then((user) => {
    console.log('\n✓ Admin user created successfully!');
    console.log('\nLogin credentials:');
    console.log(`  Email: admin@smartbookmarks.app`);
    console.log(`  Password: Admin123!`);
  })
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
