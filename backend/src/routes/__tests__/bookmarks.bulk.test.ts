import request from 'supertest';
import { app } from '../../server';
import { prisma } from '../../db/prisma';
import { generateTestToken } from '../../utils/testHelpers';

describe('POST /api/v1/bookmarks/bulk', () => {
  const testUserId = 'test-user-id';
  let authToken: string;

  beforeAll(async () => {
    authToken = generateTestToken(testUserId, 'test@example.com');
  });

  afterEach(async () => {
    await prisma.bookmark.deleteMany({ where: { userId: testUserId } });
  });

  it('should create multiple bookmarks from URL list', async () => {
    const urls = [
      'https://example.com/article1',
      'https://example.com/article2',
      'https://example.com/article3'
    ];

    const response = await request(app)
      .post('/api/v1/bookmarks/bulk')
      .set('Cookie', `accessToken=${authToken}`)
      .send({ urls })
      .expect(200);

    expect(response.body.created).toBe(3);
    expect(response.body.bookmarks).toHaveLength(3);
    expect(response.body.bookmarks[0]).toHaveProperty('id');
    expect(response.body.bookmarks[0].status).toBe('pending');
    expect(response.body.bookmarks[0].url).toBe(urls[0]);
  });

  it('should reject empty URL list', async () => {
    await request(app)
      .post('/api/v1/bookmarks/bulk')
      .set('Cookie', `accessToken=${authToken}`)
      .send({ urls: [] })
      .expect(400);
  });

  it('should reject if URL list exceeds 100', async () => {
    const urls = Array(101).fill('https://example.com/article');

    await request(app)
      .post('/api/v1/bookmarks/bulk')
      .set('Cookie', `accessToken=${authToken}`)
      .send({ urls })
      .expect(400);
  });
});
