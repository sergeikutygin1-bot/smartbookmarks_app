import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createTestUser() {
  try {
    // Check if user already exists
    const existingUser = await prisma.user.findFirst();

    if (existingUser) {
      console.log('✅ User already exists:');
      console.log(`   ID: ${existingUser.id}`);
      console.log(`   Email: ${existingUser.email}`);
      return existingUser;
    }

    // Create test user
    const user = await prisma.user.create({
      data: {
        email: 'test@smartbookmarks.app',
        passwordHash: null, // Not needed for dev auth
        emailVerified: true,
      },
    });

    console.log('✅ Test user created successfully!');
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log('\nYou can now use the app!');

    return user;
  } catch (error) {
    console.error('❌ Error creating user:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

createTestUser();
