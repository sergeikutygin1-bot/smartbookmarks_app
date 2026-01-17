import prisma from '../../db/prisma';
import { passwordService } from './PasswordService';
import { tokenService } from './TokenService';
import { accountLockoutService } from './AccountLockoutService';

export interface UserResponse {
  id: string;
  email: string;
  emailVerified: boolean;
  createdAt: Date;
}

export interface AuthResponse {
  user: UserResponse;
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    tokenType: 'Bearer';
  };
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export class AuthService {
  /**
   * Register a new user
   */
  async register(email: string, password: string): Promise<AuthResponse> {
    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // Validate password strength
    const validation = passwordService.validatePasswordStrength(password);
    if (!validation.valid) {
      throw new Error(validation.errors.join(', '));
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const passwordHash = await passwordService.hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
      },
    });

    // Generate tokens
    const tokens = await tokenService.generateTokenPair(user.id, user.email);

    return {
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
      },
      tokens: {
        ...tokens,
        tokenType: 'Bearer',
      },
    };
  }

  /**
   * Login a user
   */
  async login(email: string, password: string): Promise<AuthResponse> {
    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // Check account lockout
    const isLocked = await accountLockoutService.isAccountLocked(normalizedEmail);
    if (isLocked) {
      const timeRemaining = await accountLockoutService.getLockoutTimeRemaining(normalizedEmail);
      throw new Error(
        `Account is locked due to too many failed login attempts. Try again in ${Math.ceil(timeRemaining / 60)} minutes.`
      );
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user || !user.passwordHash) {
      // Record failed attempt
      await accountLockoutService.recordFailedAttempt(normalizedEmail);
      throw new Error('Invalid email or password');
    }

    // Verify password
    const isValid = await passwordService.verifyPassword(password, user.passwordHash);

    if (!isValid) {
      // Record failed attempt
      await accountLockoutService.recordFailedAttempt(normalizedEmail);
      throw new Error('Invalid email or password');
    }

    // Clear failed attempts on successful login
    await accountLockoutService.clearFailedAttempts(normalizedEmail);

    // Generate tokens
    const tokens = await tokenService.generateTokenPair(user.id, user.email);

    return {
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
      },
      tokens: {
        ...tokens,
        tokenType: 'Bearer',
      },
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refresh(refreshToken: string): Promise<TokenResponse> {
    // Verify refresh token
    const userId = await tokenService.verifyRefreshToken(refreshToken);

    if (!userId) {
      throw new Error('Invalid or expired refresh token');
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Rotate refresh token (generate new, revoke old)
    const newRefreshToken = await tokenService.rotateRefreshToken(refreshToken, userId);

    // Generate new access token
    const accessToken = tokenService.signAccessToken({
      userId: user.id,
      email: user.email,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: 15 * 60, // 15 minutes
      tokenType: 'Bearer',
    };
  }

  /**
   * Logout a user (revoke refresh token)
   */
  async logout(refreshToken: string): Promise<void> {
    await tokenService.revokeRefreshToken(refreshToken);
  }

  /**
   * Logout from all devices (revoke all refresh tokens for a user)
   */
  async logoutAll(userId: string): Promise<void> {
    await tokenService.revokeAllUserTokens(userId);
  }

  /**
   * Get current user by ID
   */
  async getCurrentUser(userId: string): Promise<UserResponse> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    };
  }
}

export const authService = new AuthService();
