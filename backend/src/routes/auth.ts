import express, { Request, Response } from 'express';
import passport from '../config/passport';
import { authService } from '../services/auth/AuthService';
import { accountLockoutService } from '../services/auth/AccountLockoutService';
import { tokenService } from '../services/auth/TokenService';
import { authMiddleware } from '../middleware/auth';
import { auditService, AuditEventType } from '../services/AuditService';
import { getCsrfToken, clearCsrfSecret } from '../middleware/csrf';
import { sanitizeEmail, sanitizeText } from '../utils/sanitize';
import { logger } from '../services/logger';

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
 * @openapi
 * /api/v1/auth/register:
 *   post:
 *     summary: Register a new user account
 *     description: Create a new user account with email and password. Sets authentication cookies automatically.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - confirmPassword
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User email address
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 description: Password (min 8 characters, requires uppercase, lowercase, number, special char)
 *                 example: SecurePass123!
 *               confirmPassword:
 *                 type: string
 *                 format: password
 *                 description: Password confirmation (must match password)
 *                 example: SecurePass123!
 *     responses:
 *       201:
 *         description: User registered successfully
 *         headers:
 *           Set-Cookie:
 *             description: Sets accessToken and refreshToken cookies
 *             schema:
 *               type: string
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 tokens:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                     refreshToken:
 *                       type: string
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       409:
 *         description: Email already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
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

    // Sanitize email to prevent XSS
    const sanitizedEmail = sanitizeEmail(email);

    // Register user
    const result = await authService.register(sanitizedEmail, password);

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
 * @openapi
 * /api/v1/auth/login:
 *   post:
 *     summary: Login with email and password
 *     description: Authenticate user and receive JWT tokens. Sets authentication cookies automatically. Implements account lockout after 5 failed attempts.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User email address
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 description: User password
 *                 example: SecurePass123!
 *     responses:
 *       200:
 *         description: Login successful
 *         headers:
 *           Set-Cookie:
 *             description: Sets accessToken and refreshToken cookies
 *             schema:
 *               type: string
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 tokens:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                     refreshToken:
 *                       type: string
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       423:
 *         description: Account locked due to too many failed attempts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Account Locked
 *                 message:
 *                   type: string
 *                   example: Too many failed login attempts. Please try again later.
 *                 retryAfter:
 *                   type: integer
 *                   description: Seconds until account unlocks
 *                   example: 900
 *       500:
 *         description: Server error
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

    // Sanitize email to prevent XSS
    const sanitizedEmail = sanitizeEmail(email);

    // Check account lockout
    const isLocked = await accountLockoutService.isAccountLocked(sanitizedEmail);
    if (isLocked) {
      const timeRemaining = await accountLockoutService.getLockoutTimeRemaining(sanitizedEmail);
      return res.status(423).json({
        error: 'Account Locked',
        message: 'Too many failed login attempts. Please try again later.',
        retryAfter: timeRemaining,
      });
    }

    // Login user
    const result = await authService.login(sanitizedEmail, password);

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
 * @openapi
 * /api/v1/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     description: Get a new access token using a valid refresh token. Accepts token from cookie or request body.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: Refresh token (optional if provided via cookie)
 *                 example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *         headers:
 *           Set-Cookie:
 *             description: Sets new accessToken and refreshToken cookies
 *             schema:
 *               type: string
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         description: Invalid or expired refresh token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
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
 * @openapi
 * /api/v1/auth/logout:
 *   post:
 *     summary: Logout user
 *     description: Logout user, revoke refresh token, and clear authentication cookies
 *     tags:
 *       - Authentication
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: Refresh token to revoke (optional if provided via cookie)
 *     responses:
 *       200:
 *         description: Logged out successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Logged out successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
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

    // Clear CSRF secret
    if (req.user?.id) {
      clearCsrfSecret(req.user.id);
    }

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
 * @openapi
 * /api/v1/auth/csrf-token:
 *   get:
 *     summary: Get CSRF token
 *     description: Retrieve a CSRF token for the authenticated user. Required for cookie-based authentication on POST/PATCH/DELETE operations.
 *     tags:
 *       - Authentication
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: CSRF token generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 csrfToken:
 *                   type: string
 *                   description: CSRF token to include in X-CSRF-Token header
 *                   example: abc123def456
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/csrf-token', authMiddleware, getCsrfToken);

/**
 * @openapi
 * /api/v1/auth/me:
 *   get:
 *     summary: Get current user
 *     description: Retrieve the authenticated user's profile information
 *     tags:
 *       - Authentication
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Server error
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
 * @openapi
 * /api/v1/auth/verify-email:
 *   get:
 *     summary: Verify email address
 *     description: Verify user email address using the token sent via email
 *     tags:
 *       - Authentication
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Email verification token from email link
 *         example: abc123def456
 *     responses:
 *       200:
 *         description: Email verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Email verified successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       500:
 *         description: Server error
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
 * @openapi
 * /api/v1/auth/resend-verification:
 *   post:
 *     summary: Resend verification email
 *     description: Resend email verification link to user's email address
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User email address
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: Verification email sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Verification email sent
 *       400:
 *         description: Email already verified or invalid
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Server error
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
 * @openapi
 * /api/v1/auth/forgot-password:
 *   post:
 *     summary: Request password reset
 *     description: Request a password reset email. Always returns success to prevent user enumeration.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User email address
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: Password reset email sent (if email exists)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: If that email exists, a password reset link has been sent
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
 * @openapi
 * /api/v1/auth/reset-password:
 *   post:
 *     summary: Reset password
 *     description: Reset user password using the token from password reset email
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - newPassword
 *             properties:
 *               token:
 *                 type: string
 *                 description: Password reset token from email link
 *                 example: abc123def456
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 description: New password (min 8 characters, requires uppercase, lowercase, number, special char)
 *                 example: NewSecurePass123!
 *     responses:
 *       200:
 *         description: Password reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Password reset successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       500:
 *         description: Server error
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
 * @openapi
 * /api/v1/auth/google/test:
 *   get:
 *     summary: Test Google OAuth configuration
 *     description: Test endpoint to verify Google OAuth callback URL configuration
 *     tags:
 *       - Authentication
 *     responses:
 *       200:
 *         description: OAuth configuration details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 callbackUrl:
 *                   type: string
 *                 instructions:
 *                   type: string
 *                 googleConsoleUrl:
 *                   type: string
 *                 clientId:
 *                   type: string
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
 * @openapi
 * /api/v1/auth/google:
 *   get:
 *     summary: Google OAuth login
 *     description: Initiate Google OAuth authentication flow. Redirects user to Google login page.
 *     tags:
 *       - Authentication
 *     responses:
 *       302:
 *         description: Redirects to Google OAuth consent page
 *       500:
 *         description: OAuth initialization failed
 */
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email'],
  session: false,
}));

/**
 * @openapi
 * /api/v1/auth/google/callback:
 *   get:
 *     summary: Google OAuth callback
 *     description: Google OAuth callback endpoint. Handles authentication response and redirects to frontend with auth cookies set.
 *     tags:
 *       - Authentication
 *     parameters:
 *       - in: query
 *         name: code
 *         schema:
 *           type: string
 *         description: Authorization code from Google (automatically provided)
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *         description: State parameter for CSRF protection (automatically provided)
 *     responses:
 *       302:
 *         description: Redirects to frontend with auth=success or error=oauth_failed
 *         headers:
 *           Set-Cookie:
 *             description: Sets accessToken and refreshToken cookies on success
 *             schema:
 *               type: string
 *           Location:
 *             description: Redirect URL to frontend
 *             schema:
 *               type: string
 *               example: http://localhost:3000/?auth=success
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
 * @openapi
 * /api/v1/auth/github:
 *   get:
 *     summary: GitHub OAuth login
 *     description: Initiate GitHub OAuth authentication flow. Redirects user to GitHub login page.
 *     tags:
 *       - Authentication
 *     responses:
 *       302:
 *         description: Redirects to GitHub OAuth consent page
 *       500:
 *         description: OAuth initialization failed
 */
router.get('/github', passport.authenticate('github', {
  scope: ['user:email'],
  session: false,
}));

/**
 * @openapi
 * /api/v1/auth/github/callback:
 *   get:
 *     summary: GitHub OAuth callback
 *     description: GitHub OAuth callback endpoint. Handles authentication response and redirects to frontend with auth cookies set.
 *     tags:
 *       - Authentication
 *     parameters:
 *       - in: query
 *         name: code
 *         schema:
 *           type: string
 *         description: Authorization code from GitHub (automatically provided)
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *         description: State parameter for CSRF protection (automatically provided)
 *     responses:
 *       302:
 *         description: Redirects to frontend with auth=success or error=oauth_failed
 *         headers:
 *           Set-Cookie:
 *             description: Sets accessToken and refreshToken cookies on success
 *             schema:
 *               type: string
 *           Location:
 *             description: Redirect URL to frontend
 *             schema:
 *               type: string
 *               example: http://localhost:3000/?auth=success
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

/**
 * @openapi
 * /api/v1/auth/extension-token:
 *   get:
 *     summary: Get tokens for browser extension
 *     description: Returns access and refresh tokens for the authenticated user to pass to browser extension
 *     tags:
 *       - Auth
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Tokens retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/extension-token', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const email = req.user!.email;

    // Generate new tokens for the extension
    const accessToken = tokenService.signAccessToken({ userId, email });
    const refreshToken = await tokenService.generateRefreshToken(userId);

    logger.info(`[Extension Token] Generated tokens for user ${userId}`);

    res.json({
      accessToken,
      refreshToken
    });
  } catch (error) {
    logger.error('[Extension Token] Error:', error);
    res.status(500).json({
      error: 'Failed to generate tokens',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
