import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import prisma from '../db/prisma';

/**
 * Configure Google OAuth Strategy
 */
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: 'http://localhost:3002/api/v1/auth/google/callback',
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log('[Google OAuth] Token exchange successful, profile received:', {
          id: profile.id,
          email: profile.emails?.[0]?.value
        });

        const email = profile.emails?.[0]?.value;

        if (!email) {
          console.error('[Google OAuth] No email in profile:', profile);
          return done(new Error('No email from Google'));
        }

        // Find or create user
        let user = await prisma.user.findUnique({
          where: { email },
        });

        if (user) {
          // Link Google account if not already linked
          if (!user.googleId) {
            user = await prisma.user.update({
              where: { id: user.id },
              data: { googleId: profile.id },
            });
          }
        } else {
          // Create new user
          user = await prisma.user.create({
            data: {
              email,
              googleId: profile.id,
              emailVerified: true, // Trust Google verification
              passwordHash: null, // OAuth users don't have passwords
            },
          });
        }

        done(null, user);
      } catch (error) {
        done(error);
      }
    }
  )
);

/**
 * Configure GitHub OAuth Strategy (optional - only if credentials are provided)
 */
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: 'http://localhost:3002/api/v1/auth/github/callback',
        scope: ['user:email'],
      },
      async (accessToken: string, refreshToken: string, profile: any, done: any) => {
        try {
          const email = profile.emails?.[0]?.value;

          if (!email) {
            return done(new Error('No email from GitHub'));
          }

          // Find or create user
          let user = await prisma.user.findUnique({
            where: { email },
          });

          if (user) {
            // Link GitHub account if not already linked
            if (!user.githubId) {
              user = await prisma.user.update({
                where: { id: user.id },
                data: { githubId: profile.id },
              });
            }
          } else {
            // Create new user
            user = await prisma.user.create({
              data: {
                email,
                githubId: profile.id,
                emailVerified: true, // Trust GitHub verification
                passwordHash: null, // OAuth users don't have passwords
              },
            });
          }

          done(null, user);
        } catch (error) {
          done(error);
        }
      }
    )
  );
} else {
  console.log('GitHub OAuth not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to enable.');
}

export default passport;
