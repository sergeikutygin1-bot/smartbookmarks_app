import RedisClient from '../../config/redis';

const LOCKOUT_THRESHOLD = parseInt(process.env.LOGIN_LOCKOUT_THRESHOLD || '5', 10);
const LOCKOUT_DURATION = parseInt(process.env.LOGIN_LOCKOUT_DURATION || '900', 10); // 15 minutes in seconds

export class AccountLockoutService {
  private redis = RedisClient.getInstance();

  private getLockoutKey(email: string): string {
    return `lockout:${email.toLowerCase()}`;
  }

  /**
   * Record a failed login attempt for an email address
   * Increments counter and sets TTL to lockout duration
   */
  async recordFailedAttempt(email: string): Promise<void> {
    const key = this.getLockoutKey(email);
    const count = await this.redis.incr(key);

    // Set TTL on first failed attempt
    if (count === 1) {
      await this.redis.expire(key, LOCKOUT_DURATION);
    }
  }

  /**
   * Check if an account is currently locked out
   */
  async isAccountLocked(email: string): Promise<boolean> {
    const key = this.getLockoutKey(email);
    const count = await this.redis.get(key);

    if (!count) {
      return false;
    }

    return parseInt(count, 10) >= LOCKOUT_THRESHOLD;
  }

  /**
   * Get the number of failed attempts for an email address
   */
  async getFailedAttempts(email: string): Promise<number> {
    const key = this.getLockoutKey(email);
    const count = await this.redis.get(key);
    return count ? parseInt(count, 10) : 0;
  }

  /**
   * Get remaining time in seconds before lockout expires
   */
  async getLockoutTimeRemaining(email: string): Promise<number> {
    const key = this.getLockoutKey(email);
    const ttl = await this.redis.ttl(key);
    return ttl > 0 ? ttl : 0;
  }

  /**
   * Clear failed attempts for an email address
   * Called after successful login
   */
  async clearFailedAttempts(email: string): Promise<void> {
    const key = this.getLockoutKey(email);
    await this.redis.del(key);
  }
}

export const accountLockoutService = new AccountLockoutService();
