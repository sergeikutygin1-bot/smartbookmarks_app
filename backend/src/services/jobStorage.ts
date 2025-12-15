import fs from 'fs/promises';
import path from 'path';

/**
 * Job Execution Storage Service
 *
 * Stores complete execution traces for enrichment jobs including:
 * - Agent execution details (inputs, outputs, timing)
 * - Model responses and token usage
 * - Errors and retry attempts
 * - Quality scores
 */

// Storage directory
const STORAGE_DIR = path.join(process.cwd(), '.data', 'jobs');

/**
 * Agent execution trace
 */
export interface AgentTrace {
  agentName: string;
  startTime: Date;
  endTime?: Date;
  duration?: number; // milliseconds
  input: any;
  output?: any;
  error?: string;
  metadata?: {
    model?: string;
    tokens?: number;
    cacheHit?: boolean;
    retryAttempt?: number;
    [key: string]: any;
  };
}

/**
 * Complete job execution record
 */
export interface JobExecution {
  jobId: string;
  url: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';

  // Timestamps
  queuedAt: Date;
  startedAt?: Date;
  completedAt?: Date;

  // Execution details
  agentTraces: AgentTrace[];
  totalDuration?: number;

  // Final result
  result?: {
    title?: string;
    summary?: string;
    tags?: string[];
    domain?: string;
    contentType?: string;
    embedding?: number[];
    [key: string]: any;
  };

  // Error information
  error?: {
    message: string;
    stack?: string;
    failedAgent?: string;
  };

  // Quality metrics
  quality?: {
    contentLength?: number;
    summaryLength?: number;
    tagCount?: number;
    score?: number;
  };

  // User context
  userContext?: {
    userTitle?: string;
    userSummary?: string;
    userTags?: string[];
  };
}

/**
 * Job Storage Manager
 */
export class JobStorage {
  /**
   * Ensure storage directory exists
   */
  private async ensureStorageDir(): Promise<void> {
    try {
      await fs.mkdir(STORAGE_DIR, { recursive: true });
    } catch (error) {
      console.error('[JobStorage] Failed to create storage directory:', error);
    }
  }

  /**
   * Get file path for a job
   */
  private getJobFilePath(jobId: string): string {
    return path.join(STORAGE_DIR, `${jobId}.json`);
  }

  /**
   * Save job execution data
   */
  async saveJob(job: JobExecution): Promise<void> {
    await this.ensureStorageDir();

    try {
      const filePath = this.getJobFilePath(job.jobId);
      await fs.writeFile(filePath, JSON.stringify(job, null, 2), 'utf-8');
      // Reduced logging - only log errors
    } catch (error) {
      console.error(`[JobStorage] Failed to save job ${job.jobId}:`, error);
      throw error;
    }
  }

  /**
   * Get job execution data
   */
  async getJob(jobId: string): Promise<JobExecution | null> {
    try {
      const filePath = this.getJobFilePath(jobId);
      const data = await fs.readFile(filePath, 'utf-8');
      const job = JSON.parse(data);

      // Parse dates
      job.queuedAt = new Date(job.queuedAt);
      if (job.startedAt) job.startedAt = new Date(job.startedAt);
      if (job.completedAt) job.completedAt = new Date(job.completedAt);

      job.agentTraces = job.agentTraces.map((trace: any) => ({
        ...trace,
        startTime: new Date(trace.startTime),
        endTime: trace.endTime ? new Date(trace.endTime) : undefined,
      }));

      return job;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return null; // Job not found
      }
      console.error(`[JobStorage] Failed to get job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * List all jobs (sorted by queued time, newest first)
   */
  async listJobs(options?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<JobExecution[]> {
    await this.ensureStorageDir();

    try {
      const files = await fs.readdir(STORAGE_DIR);
      const jobFiles = files.filter(f => f.endsWith('.json'));

      // Load all jobs
      const jobs: JobExecution[] = [];
      for (const file of jobFiles) {
        const jobId = file.replace('.json', '');
        const job = await this.getJob(jobId);
        if (job) {
          jobs.push(job);
        }
      }

      // Filter by status if specified
      let filteredJobs = jobs;
      if (options?.status) {
        filteredJobs = jobs.filter(j => j.status === options.status);
      }

      // Sort by queued time (newest first)
      filteredJobs.sort((a, b) => b.queuedAt.getTime() - a.queuedAt.getTime());

      // Apply pagination
      const offset = options?.offset || 0;
      const limit = options?.limit || 50;

      return filteredJobs.slice(offset, offset + limit);
    } catch (error) {
      console.error('[JobStorage] Failed to list jobs:', error);
      return [];
    }
  }

  /**
   * Update job status
   */
  async updateJobStatus(
    jobId: string,
    status: JobExecution['status'],
    additionalData?: Partial<JobExecution>
  ): Promise<void> {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    job.status = status;

    if (status === 'processing' && !job.startedAt) {
      job.startedAt = new Date();
    }

    if ((status === 'completed' || status === 'failed') && !job.completedAt) {
      job.completedAt = new Date();

      if (job.startedAt) {
        job.totalDuration = job.completedAt.getTime() - job.startedAt.getTime();
      }
    }

    // Merge additional data
    if (additionalData) {
      Object.assign(job, additionalData);
    }

    await this.saveJob(job);
  }

  /**
   * Add agent trace to job
   */
  async addAgentTrace(jobId: string, trace: AgentTrace): Promise<void> {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    job.agentTraces.push(trace);
    await this.saveJob(job);
  }

  /**
   * Get jobs statistics
   */
  async getStats(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    avgDuration: number;
    last24Hours: number;
  }> {
    const jobs = await this.listJobs({ limit: 1000 });

    const byStatus: Record<string, number> = {
      queued: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };

    let totalDuration = 0;
    let completedCount = 0;

    const now = Date.now();
    const last24Hours = jobs.filter(j =>
      now - j.queuedAt.getTime() < 24 * 60 * 60 * 1000
    ).length;

    for (const job of jobs) {
      byStatus[job.status]++;

      if (job.totalDuration) {
        totalDuration += job.totalDuration;
        completedCount++;
      }
    }

    return {
      total: jobs.length,
      byStatus,
      avgDuration: completedCount > 0 ? Math.round(totalDuration / completedCount) : 0,
      last24Hours,
    };
  }

  /**
   * Delete old jobs (cleanup)
   */
  async deleteOldJobs(daysOld: number = 30): Promise<number> {
    const jobs = await this.listJobs({ limit: 10000 });
    const cutoff = Date.now() - (daysOld * 24 * 60 * 60 * 1000);

    let deleted = 0;

    for (const job of jobs) {
      if (job.queuedAt.getTime() < cutoff) {
        try {
          const filePath = this.getJobFilePath(job.jobId);
          await fs.unlink(filePath);
          deleted++;
        } catch (error) {
          console.error(`[JobStorage] Failed to delete job ${job.jobId}:`, error);
        }
      }
    }

    console.log(`[JobStorage] Deleted ${deleted} jobs older than ${daysOld} days`);
    return deleted;
  }
}

/**
 * Singleton instance
 */
let jobStorageInstance: JobStorage | null = null;

export function getJobStorage(): JobStorage {
  if (!jobStorageInstance) {
    jobStorageInstance = new JobStorage();
  }
  return jobStorageInstance;
}
