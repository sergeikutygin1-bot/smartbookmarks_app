import express, { Request, Response } from 'express';
import passport from '../config/passport';
import { authService } from '../services/auth/AuthService';
import { accountLockoutService } from '../services/auth/AccountLockoutService';
import { tokenService } from '../services/auth/TokenService';
import { authMiddleware } from '../middleware/auth';
import { auditService, AuditEventType } from '../services/AuditService';

const router = express.Router();

// Helper to set auth cookies
interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

function setAuthCookies(res: Response, tokens: TokenPair) {
  const isProduction = process.env.NODE_ENV === 'production';

  res.cookie('accessToken', tokens.accessToken, {
    httpOnly: true,
    secure: isProduction, // HTTPS only in production
    sameSite: isProduction ? 'strict' : 'lax', // 'lax' for dev cross-port, 'strict' for prod same-origin
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  res.cookie('refreshToken', tokens.refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax', // 'lax' for dev cross-port, 'strict' for prod same-origin
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

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

    // Set cookies
    setAuthCookies(res, result.tokens);

    // Log successful registration
    await auditService.log({
      userId: result.user.id,
      email: result.user.email,
      eventType: AuditEventType.REGISTER,
      success: true,
      req,
    });

    return res.status(201).json({
      user: result.user,
      // Still return tokens for backward compatibility during migration
      tokens: result.tokens
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Registration failed';
    const { email } = req.body;

    // Log failed registration
    await auditService.log({
      email,
      eventType: AuditEventType.REGISTER,
      success: false,
      req,
      metadata: { error: errorMessage },
    });

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

    // Set cookies
    setAuthCookies(res, result.tokens);

    // Log successful login
    await auditService.log({
      userId: result.user.id,
      email: result.user.email,
      eventType: AuditEventType.LOGIN,
      success: true,
      req,
    });

    return res.status(200).json({
      user: result.user,
      // Still return tokens for backward compatibility during migration
      tokens: result.tokens
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Login failed';
    const { email } = req.body;

    // Log failed login
    await auditService.log({
      email,
      eventType: AuditEventType.LOGIN,
      success: false,
      req,
      metadata: { error: errorMessage },
    });

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
    // Read refresh token from cookie OR body (backward compatibility)
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

    // Validate required fields
    if (!refreshToken) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Refresh token is required',
      });
    }

    // Refresh token
    const result = await authService.refresh(refreshToken);

    // Set new cookies
    setAuthCookies(res, result);

    return res.status(200).json(result); // Backward compatibility
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
    // Read refresh token from cookie OR body (backward compatibility)
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

    // Refresh token is optional - if not provided, user is just clearing client state
    if (refreshToken) {
      await authService.logout(refreshToken);
    }

    // Clear cookies
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    // Log successful logout
    await auditService.log({
      userId: req.user?.id,
      email: req.user?.email,
      eventType: AuditEventType.LOGOUT,
      success: true,
      req,
    });

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

/**
 * GET /api/v1/auth/verify-email?token=...
 * Verify email address using verification token
 */
router.get('/verify-email', async (req: Request, res: Response) => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Verification token required',
      });
    }

    const result = await authService.verifyEmail(token);

    if (!result.success) {
      // Log failed verification
      await auditService.log({
        eventType: AuditEventType.EMAIL_VERIFY,
        success: false,
        req,
        metadata: { error: result.message },
      });

      return res.status(400).json({
        error: 'Bad Request',
        message: result.message,
      });
    }

    // Log successful verification
    await auditService.log({
      eventType: AuditEventType.EMAIL_VERIFY,
      success: true,
      req,
    });

    return res.status(200).json({ message: result.message });
  } catch (error) {
    console.error('Email verification error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Email verification failed',
    });
  }
});

/**
 * POST /api/v1/auth/resend-verification
 * Resend email verification link
 */
router.post('/resend-verification', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Email is required',
      });
    }

    await authService.resendVerificationEmail(email);

    return res.status(200).json({
      message: 'Verification email sent',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to resend verification email';

    if (errorMessage.includes('not found')) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found',
      });
    }

    if (errorMessage.includes('already verified')) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Email already verified',
      });
    }

    console.error('Resend verification error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to resend verification email',
    });
  }
});

/**
 * POST /api/v1/auth/forgot-password
 * Request password reset email
 */
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Email required',
      });
    }

    await authService.requestPasswordReset(email);

    // Log password reset request
    await auditService.log({
      email,
      eventType: AuditEventType.PASSWORD_RESET_REQUEST,
      success: true,
      req,
    });

    // Always return success (prevent user enumeration)
    return res.status(200).json({
      message: 'If that email exists, a password reset link has been sent',
    });
  } catch (error) {
    console.error('Password reset request error:', error);
    // Always return success (prevent user enumeration)
    return res.status(200).json({
      message: 'If that email exists, a password reset link has been sent',
    });
  }
});

/**
 * POST /api/v1/auth/reset-password
 * Reset password using reset token
 */
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Token and new password required',
      });
    }

    const result = await authService.resetPassword(token, newPassword);

    if (!result.success) {
      // Log failed password reset
      await auditService.log({
        eventType: AuditEventType.PASSWORD_RESET,
        success: false,
        req,
        metadata: { error: result.message },
      });

      return res.status(400).json({
        error: 'Bad Request',
        message: result.message,
      });
    }

    // Log successful password reset
    await auditService.log({
      eventType: AuditEventType.PASSWORD_RESET,
      success: true,
      req,
    });

    return res.status(200).json({ message: result.message });
  } catch (error) {
    console.error('Password reset error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Password reset failed',
    });
  }
});

/**
 * GET /api/v1/auth/google/test
 * Test endpoint to verify callback URL configuration
 */
router.get('/google/test', (req: Request, res: Response) => {
  const callbackUrl = 'http://localhost:3002/api/v1/auth/google/callback';
  res.json({
    message: 'Google OAuth Configuration Test',
    callbackUrl,
    instructions: `Make sure this EXACT URL is added to "Authorized redirect URIs" in Google Cloud Console:`,
    googleConsoleUrl: 'https://console.cloud.google.com/apis/credentials',
    clientId: process.env.GOOGLE_CLIENT_ID,
  });
});

/**
 * GET /api/v1/auth/google
 * Initiate Google OAuth flow
 */
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email'],
  session: false,
}));

/**
 * GET /api/v1/auth/google/callback
 * Google OAuth callback handler
 */
router.get('/google/callback',
  (req: Request, res: Response, next: any) => {
    console.log('[OAuth] Google callback received:', req.query);
    passport.authenticate('google', { session: false, failureRedirect: '/login' })(req, res, next);
  },
  async (req: Request, res: Response) => {
    try {
      console.log('[OAuth] Google authentication successful, user:', req.user);
      const user = req.user as any;

      // Generate tokens
      const tokens = await tokenService.generateTokenPair(user.id, user.email);

      // Set httpOnly cookies
      setAuthCookies(res, tokens);

      // Log successful OAuth login
      await auditService.log({
        userId: user.id,
        email: user.email,
        eventType: AuditEventType.OAUTH_LOGIN,
        success: true,
        req,
        metadata: { provider: 'google' },
      });

      // Redirect to frontend
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/?auth=success`);
    } catch (error) {
      console.error('OAuth callback error:', error);

      // Log failed OAuth login
      await auditService.log({
        eventType: AuditEventType.OAUTH_LOGIN,
        success: false,
        req,
        metadata: { provider: 'google', error: error instanceof Error ? error.message : 'Unknown error' },
      });

      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=oauth_failed`);
    }
  }
);

/**
 * GET /api/v1/auth/github
 * Initiate GitHub OAuth flow
 */
router.get('/github', passport.authenticate('github', {
  scope: ['user:email'],
  session: false,
}));

/**
 * GET /api/v1/auth/github/callback
 * GitHub OAuth callback handler
 */
router.get('/github/callback',
  passport.authenticate('github', { session: false, failureRedirect: '/login' }),
  async (req: Request, res: Response) => {
    try {
      const user = req.user as any;

      // Generate tokens
      const tokens = await tokenService.generateTokenPair(user.id, user.email);

      // Set httpOnly cookies
      setAuthCookies(res, tokens);

      // Log successful OAuth login
      await auditService.log({
        userId: user.id,
        email: user.email,
        eventType: AuditEventType.OAUTH_LOGIN,
        success: true,
        req,
        metadata: { provider: 'github' },
      });

      // Redirect to frontend
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/?auth=success`);
    } catch (error) {
      console.error('OAuth callback error:', error);

      // Log failed OAuth login
      await auditService.log({
        eventType: AuditEventType.OAUTH_LOGIN,
        success: false,
        req,
        metadata: { provider: 'github', error: error instanceof Error ? error.message : 'Unknown error' },
      });

      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=oauth_failed`);
    }
  }
);

export default router;
