import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../../db/prisma';
import RedisClient from '../../config/redis';

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_ACCESS_TOKEN_EXPIRY = process.env.JWT_ACCESS_TOKEN_EXPIRY || '15m';
const JWT_REFRESH_TOKEN_EXPIRY = process.env.JWT_REFRESH_TOKEN_EXPIRY || '7d';

// Convert expiry string to seconds (for database storage)
const REFRESH_TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

export interface JWTPayload {
  userId: string;
  email: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
}

export class TokenService {
  private redis = RedisClient.getInstance();

  /**
   * Sign a JWT access token
   */
  signAccessToken(payload: JWTPayload): string {
    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_ACCESS_TOKEN_EXPIRY,
    });
  }

  /**
   * Verify a JWT access token
   * Returns the payload if valid, null otherwise
   */
  verifyAccessToken(token: string): JWTPayload | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
      return decoded;
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate a cryptographically secure refresh token
   * Stores it in the database with expiration
   */
  async generateRefreshToken(userId: string): Promise<string> {
    // Generate opaque token (64 characters, URL-safe)
    const token = crypto.randomBytes(32).toString('base64url');

    // Calculate expiration date
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_SECONDS * 1000);

    // Store in database
    await prisma.refreshToken.create({
      data: {
        userId,
        token,
        expiresAt,
      },
    });

    return token;
  }

  /**
   * Verify a refresh token
   * Returns the userId if valid, null otherwise
   */
  async verifyRefreshToken(token: string): Promise<string | null> {
    try {
      // Check if token is blacklisted
      const blacklisted = await this.isTokenBlacklisted(token);
      if (blacklisted) {
        return null;
      }

      // Look up token in database
      const refreshToken = await prisma.refreshToken.findUnique({
        where: { token },
      });

      if (!refreshToken) {
        return null;
      }

      // Check if expired
      if (refreshToken.expiresAt < new Date()) {
        // Delete expired token
        await prisma.refreshToken.delete({
          where: { id: refreshToken.id },
        });
        return null;
      }

      return refreshToken.userId;
    } catch (error) {
      console.error('Error verifying refresh token:', error);
      return null;
    }
  }

  /**
   * Revoke a refresh token (add to blacklist)
   */
  async revokeRefreshToken(token: string): Promise<void> {
    try {
      // Add to Redis blacklist with TTL of 7 days
      const blacklistKey = `token:blacklist:${token}`;
      await this.redis.setex(blacklistKey, REFRESH_TOKEN_EXPIRY_SECONDS, 'revoked');

      // Delete from database
      await prisma.refreshToken.deleteMany({
        where: { token },
      });
    } catch (error) {
      console.error('Error revoking refresh token:', error);
    }
  }

  /**
   * Check if a token is blacklisted
   */
  private async isTokenBlacklisted(token: string): Promise<boolean> {
    const blacklistKey = `token:blacklist:${token}`;
    const result = await this.redis.get(blacklistKey);
    return result !== null;
  }

  /**
   * Rotate a refresh token (revoke old, generate new)
   * Used during token refresh to prevent reuse
   */
  async rotateRefreshToken(oldToken: string, userId: string): Promise<string> {
    // Revoke old token
    await this.revokeRefreshToken(oldToken);

    // Generate new token
    return this.generateRefreshToken(userId);
  }

  /**
   * Generate both access and refresh tokens for a user
   */
  async generateTokenPair(userId: string, email: string): Promise<TokenPair> {
    const accessToken = this.signAccessToken({ userId, email });
    const refreshToken = await this.generateRefreshToken(userId);

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 minutes in seconds
    };
  }

  /**
   * Cleanup expired refresh tokens (call periodically)
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await prisma.refreshToken.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    return result.count;
  }

  /**
   * Revoke all refresh tokens for a user
   * Useful for logout all devices or security events
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    const tokens = await prisma.refreshToken.findMany({
      where: { userId },
      select: { token: true },
    });

    // Add all to blacklist
    await Promise.all(
      tokens.map((t) => this.revokeRefreshToken(t.token))
    );
  }
}

export const tokenService = new TokenService();
