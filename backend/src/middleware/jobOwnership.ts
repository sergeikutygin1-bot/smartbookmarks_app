import { Request, Response, NextFunction } from 'express';
import { enrichmentQueue } from '../queues/enrichmentQueue';

/**
 * Job ownership middleware - requires authMiddleware to run first
 * Validates that the authenticated user owns the job they're trying to access
 */
export const jobOwnershipMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { jobId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    if (!jobId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Job ID is required',
      });
    }

    // Get job from queue
    const job = await enrichmentQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Job not found',
      });
    }

    // Check if user owns the job
    const jobUserId = job.data?.userId;

    if (!jobUserId) {
      // Job doesn't have userId (old job or malformed), deny access
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Job ownership cannot be verified',
      });
    }

    if (jobUserId !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to access this job',
      });
    }

    next();
  } catch (error) {
    console.error('Job ownership middleware error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to verify job ownership',
    });
  }
};
