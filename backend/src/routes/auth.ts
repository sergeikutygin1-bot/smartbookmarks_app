import express, { Request, Response } from 'express';
import { authService } from '../services/auth/AuthService';
import { accountLockoutService } from '../services/auth/AccountLockoutService';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

/**
 * POST /api/v1/auth/register
 * Register a new user account
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, confirmPassword } = req.body;

    // Validate required fields
    if (!email || !password || !confirmPassword) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Email, password, and confirmPassword are required',
      });
    }

    // Validate passwords match
    if (password !== confirmPassword) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Passwords do not match',
      });
    }

    // Register user
    const result = await authService.register(email, password);

    return res.status(201).json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Registration failed';

    // Check for specific error types
    if (errorMessage.includes('already exists')) {
      return res.status(409).json({
        error: 'Conflict',
        message: errorMessage,
      });
    }

    if (errorMessage.includes('Password must')) {
      return res.status(400).json({
        error: 'Bad Request',
        message: errorMessage,
      });
    }

    console.error('Registration error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Registration failed',
    });
  }
});

/**
 * POST /api/v1/auth/login
 * Login with email and password
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Email and password are required',
      });
    }

    // Check account lockout
    const isLocked = await accountLockoutService.isAccountLocked(email);
    if (isLocked) {
      const timeRemaining = await accountLockoutService.getLockoutTimeRemaining(email);
      return res.status(423).json({
        error: 'Account Locked',
        message: 'Too many failed login attempts. Please try again later.',
        retryAfter: timeRemaining,
      });
    }

    // Login user
    const result = await authService.login(email, password);

    return res.status(200).json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Login failed';

    // Check for specific error types
    if (errorMessage.includes('Invalid email or password')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    }

    if (errorMessage.includes('locked')) {
      const timeMatch = errorMessage.match(/(\d+) minutes/);
      const retryAfter = timeMatch ? parseInt(timeMatch[1], 10) * 60 : 900;

      return res.status(423).json({
        error: 'Account Locked',
        message: errorMessage,
        retryAfter,
      });
    }

    console.error('Login error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Login failed',
    });
  }
});

/**
 * POST /api/v1/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    // Validate required fields
    if (!refreshToken) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Refresh token is required',
      });
    }

    // Refresh token
    const result = await authService.refresh(refreshToken);

    return res.status(200).json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Token refresh failed';

    // Check for specific error types
    if (errorMessage.includes('Invalid or expired')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired refresh token',
      });
    }

    console.error('Token refresh error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Token refresh failed',
    });
  }
});

/**
 * POST /api/v1/auth/logout
 * Logout and revoke refresh token
 */
router.post('/logout', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    // Refresh token is optional - if not provided, user is just clearing client state
    if (refreshToken) {
      await authService.logout(refreshToken);
    }

    return res.status(200).json({
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Logout failed',
    });
  }
});

/**
 * GET /api/v1/auth/me
 * Get current authenticated user
 */
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const user = await authService.getCurrentUser(userId);

    return res.status(200).json({ user });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get user';

    if (errorMessage.includes('not found')) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found',
      });
    }

    console.error('Get current user error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get current user',
    });
  }
});

export default router;
