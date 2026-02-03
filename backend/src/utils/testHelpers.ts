import { tokenService } from '../services/auth/TokenService';

/**
 * Generate a test JWT access token for testing
 * @param userId - User ID to include in token
 * @param email - User email to include in token
 * @returns JWT access token string
 */
export function generateTestToken(userId: string, email: string): string {
  return tokenService.signAccessToken({ userId, email });
}
