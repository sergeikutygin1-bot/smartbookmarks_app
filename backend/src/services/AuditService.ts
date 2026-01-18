import { PrismaClient } from '@prisma/client';
import { Request } from 'express';

const prisma = new PrismaClient();

export enum AuditEventType {
  LOGIN = 'login',
  LOGOUT = 'logout',
  REGISTER = 'register',
  EMAIL_VERIFY = 'email_verify',
  EMAIL_CHANGE = 'email_change',
  PASSWORD_RESET_REQUEST = 'password_reset_request',
  PASSWORD_RESET = 'password_reset',
  PASSWORD_CHANGE = 'password_change',
  OAUTH_LOGIN = 'oauth_login',
}

interface AuditLogParams {
  userId?: string;
  email?: string;
  eventType: AuditEventType;
  success: boolean;
  req?: Request;
  metadata?: any;
}

class AuditService {
  /**
   * Log an authentication event
   */
  async log(params: AuditLogParams): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId: params.userId,
          email: params.email,
          eventType: params.eventType,
          success: params.success,
          ipAddress: params.req ? this.getIpAddress(params.req) : null,
          userAgent: params.req?.headers['user-agent'] || null,
          metadata: params.metadata || null,
        },
      });
    } catch (error) {
      // Don't throw - audit logging failures shouldn't break auth
      console.error('Audit log error:', error);
    }
  }

  /**
   * Extract IP address from request
   * Handles X-Forwarded-For header for proxied requests
   */
  private getIpAddress(req: Request): string | null {
    const forwarded = req.headers['x-forwarded-for'];

    if (forwarded) {
      // X-Forwarded-For can contain multiple IPs, take the first one
      const ips = typeof forwarded === 'string' ? forwarded.split(',') : forwarded;
      return ips[0].trim();
    }

    return req.socket.remoteAddress || null;
  }

  /**
   * Get audit logs for a user
   */
  async getUserLogs(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
      eventType?: AuditEventType;
    }
  ) {
    const where: any = { userId };

    if (options?.eventType) {
      where.eventType = options.eventType;
    }

    return prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 50,
      skip: options?.offset || 0,
    });
  }

  /**
   * Get recent failed login attempts for security monitoring
   */
  async getRecentFailedLogins(email: string, hours: number = 24): Promise<number> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const count = await prisma.auditLog.count({
      where: {
        email,
        eventType: AuditEventType.LOGIN,
        success: false,
        createdAt: {
          gte: since,
        },
      },
    });

    return count;
  }
}

export const auditService = new AuditService();
