// Jest setup file
// This runs before all tests

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing-only';

// Mock isomorphic-dompurify to avoid ESM issues
jest.mock('isomorphic-dompurify', () => ({
  sanitize: (html: string) => html,
}));

// Mock uuid to avoid ESM issues
jest.mock('uuid', () => ({
  v4: () => 'test-uuid-12345',
}));

// Extend Jest timeout for integration tests
jest.setTimeout(30000);
