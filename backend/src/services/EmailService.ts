import nodemailer from 'nodemailer';
import crypto from 'crypto';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  generateVerificationToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const verificationUrl = `${FRONTEND_URL}/verify-email?token=${token}`;

    // In development, just log the verification link
    if (process.env.NODE_ENV !== 'production') {
      console.log('\n' + '='.repeat(80));
      console.log('📧 EMAIL VERIFICATION LINK (Development Mode)');
      console.log('='.repeat(80));
      console.log(`To: ${email}`);
      console.log(`Link: ${verificationUrl}`);
      console.log(`Token: ${token}`);
      console.log('='.repeat(80) + '\n');
      return;
    }

    await this.transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@smartbookmarks.app',
      to: email,
      subject: 'Verify Your Email - Smart Bookmarks',
      html: `
        <h1>Welcome to Smart Bookmarks!</h1>
        <p>Please verify your email address by clicking the link below:</p>
        <a href="${verificationUrl}">Verify Email</a>
        <p>This link expires in 24 hours.</p>
        <p>If you didn't create this account, please ignore this email.</p>
      `,
    });
  }

  async sendWelcomeEmail(email: string): Promise<void> {
    // In development, just log the welcome message
    if (process.env.NODE_ENV !== 'production') {
      console.log('\n' + '='.repeat(80));
      console.log('📧 WELCOME EMAIL (Development Mode)');
      console.log('='.repeat(80));
      console.log(`To: ${email}`);
      console.log(`Message: Your email has been verified. Welcome to Smart Bookmarks!`);
      console.log('='.repeat(80) + '\n');
      return;
    }

    await this.transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@smartbookmarks.app',
      to: email,
      subject: 'Welcome to Smart Bookmarks!',
      html: `
        <h1>Welcome!</h1>
        <p>Your email has been verified. You now have full access to Smart Bookmarks.</p>
        <p><a href="${FRONTEND_URL}">Get Started</a></p>
      `,
    });
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const resetUrl = `${FRONTEND_URL}/reset-password?token=${token}`;

    // In development, just log the reset link to console
    if (process.env.NODE_ENV !== 'production') {
      console.log('\n' + '='.repeat(80));
      console.log('🔐 PASSWORD RESET LINK (Development Mode)');
      console.log('='.repeat(80));
      console.log(`To: ${email}`);
      console.log(`Link: ${resetUrl}`);
      console.log(`Token: ${token}`);
      console.log(`Expires: 1 hour from now`);
      console.log('='.repeat(80) + '\n');
      return;
    }

    await this.transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@smartbookmarks.app',
      to: email,
      subject: 'Reset Your Password - Smart Bookmarks',
      html: `
        <h1>Password Reset Request</h1>
        <p>Click the link below to reset your password:</p>
        <a href="${resetUrl}">Reset Password</a>
        <p>This link expires in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `,
    });
  }
}

export const emailService = new EmailService();
