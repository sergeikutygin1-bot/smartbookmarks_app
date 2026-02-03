import request from 'supertest';
import { app } from '../../server';
import { generateTestToken } from '../../utils/testHelpers';
import { prisma } from '../../db/prisma';

describe('GET /api/v1/auth/extension-token', () => {
  const testUserId = 'test-user-extension-token';
  const testEmail = 'test-extension@example.com';
  let authToken: string;

  beforeAll(async () => {
    // Create test user in database
    await prisma.user.upsert({
      where: { id: testUserId },
      update: {},
      create: {
        id: testUserId,
        email: testEmail,
        passwordHash: 'hashed-password-not-used',
        emailVerified: true,
      },
    });

    authToken = generateTestToken(testUserId, testEmail);
  });

  afterAll(async () => {
    // Clean up test user and refresh tokens
    await prisma.refreshToken.deleteMany({ where: { userId: testUserId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
  });

  it('should return access and refresh tokens for authenticated user', async () => {
    const response = await request(app)
      .get('/api/v1/auth/extension-token')
      .set('Cookie', `accessToken=${authToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('accessToken');
    expect(response.body).toHaveProperty('refreshToken');
    expect(typeof response.body.accessToken).toBe('string');
    expect(typeof response.body.refreshToken).toBe('string');
  });

  it('should reject unauthenticated requests', async () => {
    await request(app)
      .get('/api/v1/auth/extension-token')
      .expect(401);
  });
});
