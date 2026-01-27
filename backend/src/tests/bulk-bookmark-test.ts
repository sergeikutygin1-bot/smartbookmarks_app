import axios from 'axios';
import { prisma } from '../db/prisma';
import { tokenService } from '../services/auth/TokenService';

const API_URL = process.env.API_URL || 'http://localhost:3002';
const testUserId = 'test-bulk-import-user';
const testEmail = 'test-bulk@example.com';

async function testBulkBookmarkEndpoint() {
  console.log('\n📋 Testing Bulk Bookmark Creation Endpoint\n');
  console.log('='.repeat(60));

  // Create test user if it doesn't exist
  await prisma.user.upsert({
    where: { id: testUserId },
    update: {},
    create: {
      id: testUserId,
      email: testEmail,
      passwordHash: 'test-password-hash',
      emailVerified: true,
    },
  });

  // Generate test token
  const token = tokenService.signAccessToken({ userId: testUserId, email: testEmail });

  // Get CSRF token
  console.log('\n🔐 Fetching CSRF token...');
  const csrfResponse = await axios.get(`${API_URL}/api/v1/auth/csrf-token`, {
    headers: {
      'Cookie': `accessToken=${token}`,
    },
  });
  const csrfToken = csrfResponse.data.csrfToken;
  console.log('CSRF token obtained');

  try {
    // Test 1: Create multiple bookmarks from URL list
    console.log('\n✅ Test 1: Create multiple bookmarks from URL list');
    const urls = [
      'https://example.com/article1',
      'https://example.com/article2',
      'https://example.com/article3'
    ];

    const response = await axios.post(
      `${API_URL}/api/v1/bookmarks/bulk`,
      { urls },
      {
        headers: {
          'Cookie': `accessToken=${token}`,
          'X-CSRF-Token': csrfToken,
        },
      }
    );

    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(response.data, null, 2));

    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }

    if (response.data.created !== 3) {
      throw new Error(`Expected 3 bookmarks created, got ${response.data.created}`);
    }

    if (response.data.bookmarks.length !== 3) {
      throw new Error(`Expected 3 bookmarks in response, got ${response.data.bookmarks.length}`);
    }

    console.log('✅ Test 1 PASSED');

    // Test 2: Reject empty URL list
    console.log('\n✅ Test 2: Reject empty URL list');
    try {
      await axios.post(
        `${API_URL}/api/v1/bookmarks/bulk`,
        { urls: [] },
        {
          headers: {
            'Cookie': `accessToken=${token}`,
            'X-CSRF-Token': csrfToken,
          },
        }
      );
      throw new Error('Should have rejected empty URL list');
    } catch (error: any) {
      if (error.response?.status === 400) {
        console.log('✅ Test 2 PASSED - Correctly rejected empty URL list');
      } else {
        throw error;
      }
    }

    // Test 3: Reject if URL list exceeds 100
    console.log('\n✅ Test 3: Reject if URL list exceeds 100');
    const largeUrls = Array(101).fill('https://example.com/article');
    try {
      await axios.post(
        `${API_URL}/api/v1/bookmarks/bulk`,
        { urls: largeUrls },
        {
          headers: {
            'Cookie': `accessToken=${token}`,
            'X-CSRF-Token': csrfToken,
          },
        }
      );
      throw new Error('Should have rejected URL list > 100');
    } catch (error: any) {
      if (error.response?.status === 400) {
        console.log('✅ Test 3 PASSED - Correctly rejected URL list > 100');
      } else {
        throw error;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎉 All tests PASSED!\n');

  } catch (error: any) {
    console.error('\n❌ Test FAILED:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    throw error;
  } finally {
    // Cleanup
    await prisma.bookmark.deleteMany({ where: { userId: testUserId } });
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {
      // Ignore if user doesn't exist
    });
  }
}

// Run tests
testBulkBookmarkEndpoint()
  .then(() => {
    console.log('Test suite completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
