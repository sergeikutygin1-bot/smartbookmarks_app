import { z } from 'zod';

/**
 * Zod Validation Schemas for Smart Bookmarks API
 *
 * Centralized validation schemas for all API endpoints
 * Usage with validation middleware for request validation
 */

// ============================================================
// Common Schemas
// ============================================================

const uuidSchema = z.string().uuid('Invalid UUID format');

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

// ============================================================
// Authentication Schemas
// ============================================================

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number')
      .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
    confirmPassword: z.string(),
  }).refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
});

export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().optional(), // Can also come from cookie
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Reset token is required'),
    newPassword: z.string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number')
      .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  }),
});

export const verifyEmailSchema = z.object({
  query: z.object({
    token: z.string().min(1, 'Verification token is required'),
  }),
});

// ============================================================
// Bookmark Schemas
// ============================================================

export const listBookmarksSchema = z.object({
  query: z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    type: z.enum(['article', 'video', 'social', 'document', 'other']).optional(),
    status: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
  }),
});

export const getBookmarkSchema = z.object({
  params: z.object({
    id: uuidSchema,
  }),
});

export const createBookmarkSchema = z.object({
  body: z.object({
    url: z.string().min(0, 'URL is required (can be empty string)'), // Allow empty URL for manual entry
    title: z.string().max(500).optional(),
    notes: z.string().max(5000).optional(),
    tags: z.array(z.string().max(50)).max(20).optional(),
  }),
});

export const updateBookmarkSchema = z.object({
  params: z.object({
    id: uuidSchema,
  }),
  body: z.object({
    url: z.string().optional(),
    title: z.string().max(500).optional(),
    summary: z.string().nullable().optional(),
    tags: z.array(z.object({
      name: z.string(),
    })).optional(),
    status: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
    contentType: z.enum(['article', 'video', 'social', 'document', 'other']).optional(),
    domain: z.string().optional(),
    keyPoints: z.array(z.string()).optional(),
    metadata: z.record(z.unknown()).optional(),
    embedding: z.array(z.number()).optional(),
  }),
});

export const deleteBookmarkSchema = z.object({
  params: z.object({
    id: uuidSchema,
  }),
});

// ============================================================
// Profile Schemas
// ============================================================

export const updateEmailSchema = z.object({
  body: z.object({
    newEmail: z.string().email('Invalid email address'),
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number')
      .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
    confirmPassword: z.string(),
  }).refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }),
});

export const analyticsQuerySchema = z.object({
  query: z.object({
    days: z.coerce.number().int().min(1).max(365).default(30),
    limit: z.coerce.number().int().min(1).max(100).default(10),
  }),
});

// ============================================================
// Graph Schemas
// ============================================================

export const relatedBookmarksSchema = z.object({
  params: z.object({
    id: uuidSchema,
  }),
  query: z.object({
    depth: z.coerce.number().int().min(1).max(3).default(2),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

export const listEntitiesSchema = z.object({
  query: z.object({
    type: z.enum(['person', 'company', 'technology', 'product', 'location']).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  }),
});

export const getEntityBookmarksSchema = z.object({
  params: z.object({
    id: uuidSchema,
  }),
  query: z.object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
  }),
});

export const listConceptsSchema = z.object({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(500).default(100),
  }),
});

export const relatedConceptsSchema = z.object({
  params: z.object({
    id: uuidSchema,
  }),
  query: z.object({
    minCoOccurrence: z.coerce.number().int().min(1).max(100).default(2),
  }),
});

export const refreshBookmarkGraphSchema = z.object({
  params: z.object({
    id: uuidSchema,
  }),
});

// ============================================================
// Search Schemas
// ============================================================

export const searchSchema = z.object({
  query: z.object({
    q: z.string().min(1, 'Search query is required'),
    mode: z.enum(['keyword', 'semantic', 'hybrid']).default('hybrid'),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

// ============================================================
// Enrichment Schemas
// ============================================================

export const queueEnrichmentSchema = z.object({
  body: z.object({
    url: z.string().url('Invalid URL format'),
    userTitle: z.string().optional(),
    userSummary: z.string().optional(),
    userTags: z.array(z.string()).optional(),
    existingTags: z.array(z.string()).default([]),
    bookmarkId: z.string().uuid().optional(),
  }),
});

export const getJobStatusSchema = z.object({
  params: z.object({
    jobId: z.string().min(1, 'Job ID is required'),
  }),
});

export const streamJobStatusSchema = z.object({
  params: z.object({
    jobId: z.string().min(1, 'Job ID is required'),
  }),
});
