import { Express } from 'express';
import helmet from 'helmet';

/**
 * Configure security headers using Helmet.js
 *
 * Implements:
 * - Content Security Policy (CSP)
 * - X-Frame-Options (clickjacking protection)
 * - Strict-Transport-Security (HSTS)
 * - X-Content-Type-Options (MIME sniffing protection)
 * - X-DNS-Prefetch-Control
 * - X-Download-Options
 * - X-Permitted-Cross-Domain-Policies
 * - Referrer-Policy
 * - X-XSS-Protection
 */
export function configureSecurityHeaders(app: Express): void {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  app.use(
    helmet({
      // Content Security Policy
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            // Allow inline scripts for Next.js in development
            ...(process.env.NODE_ENV === 'development' ? ["'unsafe-inline'"] : []),
          ],
          styleSrc: [
            "'self'",
            "'unsafe-inline'", // Required for styled-components and inline styles
          ],
          imgSrc: [
            "'self'",
            'data:',
            'https:', // Allow external images from bookmarks
          ],
          connectSrc: [
            "'self'",
            frontendUrl,
            'https://api.openai.com', // OpenAI API
            'https://api.smith.langchain.com', // LangSmith tracing
          ],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
          upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
        },
      },

      // Prevent clickjacking attacks
      frameguard: {
        action: 'deny',
      },

      // HTTP Strict Transport Security
      hsts: {
        maxAge: 31536000, // 1 year in seconds
        includeSubDomains: true,
        preload: true,
      },

      // Disable browser MIME-type sniffing
      noSniff: true,

      // Control DNS prefetching
      dnsPrefetchControl: {
        allow: false,
      },

      // Prevent IE from executing downloads in site's context
      ieNoOpen: true,

      // Restrict Adobe Flash and PDF
      permittedCrossDomainPolicies: {
        permittedPolicies: 'none',
      },

      // Referrer policy
      referrerPolicy: {
        policy: 'strict-origin-when-cross-origin',
      },

      // Legacy XSS protection (most modern browsers ignore this)
      xssFilter: true,
    })
  );

  // Add custom security headers
  app.use((req, res, next) => {
    // Prevent browsers from caching sensitive data
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }

    // Add API version header
    res.setHeader('X-API-Version', '1.0.0');

    // Remove X-Powered-By header (already done by helmet, but belt and suspenders)
    res.removeHeader('X-Powered-By');

    next();
  });
}
