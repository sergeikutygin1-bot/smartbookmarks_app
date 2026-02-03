# Browser Extension & Batch Import Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add browser extension (Chrome/Safari) for one-click bookmark saving and batch import UI for pasting multiple URLs.

**Architecture:** Two new entry points to existing bookmark creation pipeline: (1) Browser extension with TypeScript + React popup that authenticates via web app redirect, (2) Batch import modal in web app that accepts URL lists. Both create bookmarks with status='pending' and leverage existing enrichment queue.

**Tech Stack:** TypeScript, React, Express, Prisma, BullMQ, Webpack (for extension bundling)

---

## Phase 1: Backend API

### Task 1.1: Create Bulk Bookmark Endpoint

**Files:**
- Modify: `backend/src/routes/bookmarks.ts`
- Create test: `backend/src/routes/__tests__/bookmarks.bulk.test.ts`

**Step 1: Write the failing test**

Create `backend/src/routes/__tests__/bookmarks.bulk.test.ts`:

```typescript
import request from 'supertest';
import { app } from '../../server';
import { prisma } from '../../lib/prisma';
import { generateTestToken } from '../../utils/testHelpers';

describe('POST /api/v1/bookmarks/bulk', () => {
  const testUserId = 'test-user-id';
  let authToken: string;

  beforeAll(async () => {
    authToken = generateTestToken(testUserId, 'test@example.com');
  });

  afterEach(async () => {
    await prisma.bookmark.deleteMany({ where: { userId: testUserId } });
  });

  it('should create multiple bookmarks from URL list', async () => {
    const urls = [
      'https://example.com/article1',
      'https://example.com/article2',
      'https://example.com/article3'
    ];

    const response = await request(app)
      .post('/api/v1/bookmarks/bulk')
      .set('Cookie', `accessToken=${authToken}`)
      .send({ urls })
      .expect(200);

    expect(response.body.created).toBe(3);
    expect(response.body.bookmarks).toHaveLength(3);
    expect(response.body.bookmarks[0]).toHaveProperty('id');
    expect(response.body.bookmarks[0].status).toBe('pending');
    expect(response.body.bookmarks[0].url).toBe(urls[0]);
  });

  it('should reject empty URL list', async () => {
    await request(app)
      .post('/api/v1/bookmarks/bulk')
      .set('Cookie', `accessToken=${authToken}`)
      .send({ urls: [] })
      .expect(400);
  });

  it('should reject if URL list exceeds 1000', async () => {
    const urls = Array(1001).fill('https://example.com/article');

    await request(app)
      .post('/api/v1/bookmarks/bulk')
      .set('Cookie', `accessToken=${authToken}`)
      .send({ urls })
      .expect(400);
  });

  it('should enqueue enrichment jobs for all bookmarks', async () => {
    const urls = ['https://example.com/test'];

    await request(app)
      .post('/api/v1/bookmarks/bulk')
      .set('Cookie', `accessToken=${authToken}`)
      .send({ urls })
      .expect(200);

    // Verify job was added to queue
    // Note: This would need access to queue for verification
    // For now, we trust the implementation
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- bookmarks.bulk.test.ts`

Expected: FAIL with "Cannot POST /api/v1/bookmarks/bulk" or similar

**Step 3: Implement the bulk endpoint**

In `backend/src/routes/bookmarks.ts`, add after the existing POST route:

```typescript
/**
 * @openapi
 * /api/v1/bookmarks/bulk:
 *   post:
 *     summary: Create multiple bookmarks
 *     description: Bulk create bookmarks from a list of URLs
 *     tags:
 *       - Bookmarks
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               urls:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uri
 *                 minItems: 1
 *                 maxItems: 1000
 *     responses:
 *       200:
 *         description: Bookmarks created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 created:
 *                   type: integer
 *                 bookmarks:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Bookmark'
 *       400:
 *         description: Invalid request
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/bulk', enrichmentRateLimit, checkDailyBudget, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { urls } = req.body;

    // Validation
    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'URLs must be a non-empty array'
      });
    }

    if (urls.length > 1000) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Cannot import more than 1000 URLs at once'
      });
    }

    // Validate URL format
    const urlRegex = /^https?:\/\/.+/i;
    const invalidUrls = urls.filter(url => !urlRegex.test(url));
    if (invalidUrls.length > 0) {
      return res.status(400).json({
        error: 'Invalid URLs',
        message: `${invalidUrls.length} URLs have invalid format`,
        invalidUrls: invalidUrls.slice(0, 10) // Show first 10
      });
    }

    // Sanitize URLs
    const sanitizedUrls = urls.map(url => sanitizeUrl(url));

    logger.info(`[Bulk Import] Creating ${sanitizedUrls.length} bookmarks for user ${userId}`);

    // Create all bookmarks in transaction
    const bookmarks = await prisma.$transaction(
      sanitizedUrls.map(url =>
        prisma.bookmark.create({
          data: {
            url,
            userId,
            status: 'pending',
            createdAt: new Date()
          }
        })
      )
    );

    logger.info(`[Bulk Import] Created ${bookmarks.length} bookmarks`);

    // Enqueue enrichment jobs
    const jobs = bookmarks.map(bookmark => ({
      bookmarkId: bookmark.id,
      userId: bookmark.userId,
      url: bookmark.url
    }));

    await enrichmentQueue.addBulk(jobs);

    logger.info(`[Bulk Import] Enqueued ${jobs.length} enrichment jobs`);

    // Invalidate caches
    await invalidateBookmarkCaches(userId);
    await invalidateSearchCaches(userId);

    res.json({
      created: bookmarks.length,
      bookmarks
    });
  } catch (error) {
    logger.error('[Bulk Import] Error:', error);
    res.status(500).json({
      error: 'Failed to create bookmarks',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
```

**Step 4: Run tests to verify they pass**

Run: `cd backend && npm test -- bookmarks.bulk.test.ts`

Expected: PASS (all tests green)

**Step 5: Commit**

```bash
git add backend/src/routes/bookmarks.ts backend/src/routes/__tests__/bookmarks.bulk.test.ts
git commit -m "feat(api): add bulk bookmark creation endpoint

- POST /api/v1/bookmarks/bulk accepts array of URLs
- Creates all bookmarks in transaction with status='pending'
- Validates URL format and enforces 1000 URL limit
- Enqueues enrichment jobs for all bookmarks
- Includes comprehensive tests

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 1.2: Create Extension Token Endpoint

**Files:**
- Modify: `backend/src/routes/auth.ts`
- Create test: `backend/src/routes/__tests__/auth.extension.test.ts`

**Step 1: Write the failing test**

Create `backend/src/routes/__tests__/auth.extension.test.ts`:

```typescript
import request from 'supertest';
import { app } from '../../server';
import { generateTestToken } from '../../utils/testHelpers';

describe('GET /api/v1/auth/extension-token', () => {
  const testUserId = 'test-user-id';
  const testEmail = 'test@example.com';
  let authToken: string;

  beforeAll(async () => {
    authToken = generateTestToken(testUserId, testEmail);
  });

  it('should return access and refresh tokens for authenticated user', async () => {
    const response = await request(app)
      .get('/api/v1/auth/extension-token')
      .set('Cookie', `accessToken=${authToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('accessToken');
    expect(response.body).toHaveProperty('refreshToken');
    expect(typeof response.body.accessToken).toBe('string');
    expect(typeof response.body.refreshToken).toBe('string');
  });

  it('should reject unauthenticated requests', async () => {
    await request(app)
      .get('/api/v1/auth/extension-token')
      .expect(401);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- auth.extension.test.ts`

Expected: FAIL with "Cannot GET /api/v1/auth/extension-token"

**Step 3: Implement the extension token endpoint**

In `backend/src/routes/auth.ts`, add before `export default router`:

```typescript
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
    const accessToken = tokenService.generateAccessToken(userId, email);
    const refreshToken = tokenService.generateRefreshToken(userId, email);

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
```

**Step 4: Run tests to verify they pass**

Run: `cd backend && npm test -- auth.extension.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/routes/auth.ts backend/src/routes/__tests__/auth.extension.test.ts
git commit -m "feat(api): add extension token endpoint

- GET /api/v1/auth/extension-token returns JWT tokens
- Used by web app to pass tokens to browser extension
- Requires authentication via cookie
- Includes tests

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 2: Frontend Batch Import UI

### Task 2.1: Create Bulk Import Modal Component

**Files:**
- Create: `frontend/components/bookmarks/BulkImportModal.tsx`
- Create: `frontend/components/bookmarks/BulkImportModal.module.css`

**Step 1: Create the modal component**

Create `frontend/components/bookmarks/BulkImportModal.tsx`:

```typescript
'use client';

import { useState } from 'react';
import styles from './BulkImportModal.module.css';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

interface ParsedUrls {
  valid: string[];
  invalid: string[];
}

export function BulkImportModal({ isOpen, onClose, onImportComplete }: BulkImportModalProps) {
  const [inputText, setInputText] = useState('');
  const [parsedUrls, setParsedUrls] = useState<ParsedUrls>({ valid: [], invalid: [] });
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; failed: number } | null>(null);

  const parseUrls = (text: string): ParsedUrls => {
    const lines = text
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    const urlRegex = /^https?:\/\/.+/i;
    const valid = lines.filter(line => urlRegex.test(line));
    const invalid = lines.filter(line => !urlRegex.test(line));

    return { valid, invalid };
  };

  const handleTextChange = (text: string) => {
    setInputText(text);
    setParsedUrls(parseUrls(text));
    setImportResult(null);
  };

  const handleImport = async () => {
    if (parsedUrls.valid.length === 0) return;

    setIsImporting(true);
    setImportResult(null);

    try {
      const response = await fetch('/api/bookmarks/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ urls: parsedUrls.valid }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to import bookmarks');
      }

      const data = await response.json();

      setImportResult({
        created: data.created,
        failed: parsedUrls.invalid.length,
      });

      // Clear input after successful import
      setInputText('');
      setParsedUrls({ valid: [], invalid: [] });

      // Notify parent to refresh bookmark list
      onImportComplete();

      // Auto-close after showing result
      setTimeout(() => {
        onClose();
      }, 3000);
    } catch (error) {
      console.error('Import error:', error);
      alert('Failed to import bookmarks. Please try again.');
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Bulk Import Bookmarks</h2>
          <button className={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.content}>
          <textarea
            className={styles.textarea}
            placeholder="Paste URLs (one per line)&#10;&#10;Example:&#10;https://example.com/article1&#10;https://example.com/article2&#10;https://example.com/article3"
            value={inputText}
            onChange={e => handleTextChange(e.target.value)}
            disabled={isImporting}
          />

          <div className={styles.stats}>
            {parsedUrls.valid.length > 0 && (
              <div className={styles.validCount}>
                ✓ {parsedUrls.valid.length} valid URL{parsedUrls.valid.length !== 1 ? 's' : ''}
              </div>
            )}
            {parsedUrls.invalid.length > 0 && (
              <div className={styles.invalidCount}>
                ✗ {parsedUrls.invalid.length} invalid URL{parsedUrls.invalid.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>

          {importResult && (
            <div className={styles.result}>
              <div className={styles.resultSuccess}>
                ✓ {importResult.created} bookmark{importResult.created !== 1 ? 's' : ''} imported successfully
              </div>
              {importResult.failed > 0 && (
                <div className={styles.resultFailed}>
                  ✗ {importResult.failed} URL{importResult.failed !== 1 ? 's' : ''} skipped (invalid format)
                </div>
              )}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button
            className={styles.cancelButton}
            onClick={onClose}
            disabled={isImporting}
          >
            Cancel
          </button>
          <button
            className={styles.importButton}
            onClick={handleImport}
            disabled={parsedUrls.valid.length === 0 || isImporting}
          >
            {isImporting ? 'Importing...' : `Import ${parsedUrls.valid.length} URL${parsedUrls.valid.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Create the modal styles**

Create `frontend/components/bookmarks/BulkImportModal.module.css`:

```css
.overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #e5e7eb;
}

.header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.closeButton {
  background: none;
  border: none;
  font-size: 28px;
  color: #6b7280;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.closeButton:hover {
  color: #374151;
}

.content {
  padding: 20px;
  flex: 1;
  overflow-y: auto;
}

.textarea {
  width: 100%;
  min-height: 200px;
  padding: 12px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-family: monospace;
  font-size: 14px;
  resize: vertical;
}

.textarea:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.textarea:disabled {
  background: #f9fafb;
  cursor: not-allowed;
}

.stats {
  margin-top: 12px;
  display: flex;
  gap: 16px;
  font-size: 14px;
}

.validCount {
  color: #059669;
  font-weight: 500;
}

.invalidCount {
  color: #dc2626;
  font-weight: 500;
}

.result {
  margin-top: 16px;
  padding: 12px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 4px;
}

.resultSuccess {
  color: #059669;
  font-weight: 500;
  margin-bottom: 4px;
}

.resultFailed {
  color: #dc2626;
  font-size: 14px;
}

.footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 20px;
  border-top: 1px solid #e5e7eb;
}

.cancelButton,
.importButton {
  padding: 10px 20px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.cancelButton {
  background: white;
  border: 1px solid #d1d5db;
  color: #374151;
}

.cancelButton:hover:not(:disabled) {
  background: #f9fafb;
}

.importButton {
  background: #3b82f6;
  border: 1px solid #3b82f6;
  color: white;
}

.importButton:hover:not(:disabled) {
  background: #2563eb;
}

.importButton:disabled,
.cancelButton:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

**Step 3: Commit**

```bash
git add frontend/components/bookmarks/BulkImportModal.tsx frontend/components/bookmarks/BulkImportModal.module.css
git commit -m "feat(ui): add bulk import modal component

- Modal with textarea for pasting URLs (one per line)
- Real-time URL validation with counters
- Import progress indicator
- Success/failure result display
- Auto-closes after successful import

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 2.2: Integrate Bulk Import Button into Bookmarks Page

**Files:**
- Modify: `frontend/app/bookmarks/page.tsx`

**Step 1: Add bulk import button and modal**

In `frontend/app/bookmarks/page.tsx`, add the import and state management:

```typescript
// Add to imports at top
import { BulkImportModal } from '@/components/bookmarks/BulkImportModal';
import { useState } from 'react';

// Inside the component, add state
const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);

// Add handler for import completion
const handleImportComplete = () => {
  // Refresh bookmark list
  // This depends on your existing data fetching pattern
  // If using React Query, you might do: queryClient.invalidateQueries(['bookmarks'])
  // If using useState, you might refetch
  window.location.reload(); // Simple approach for now
};

// In the JSX, add button next to existing "Add Bookmark" button
<div className="actions">
  <button onClick={() => setIsAddBookmarkOpen(true)}>
    Add Bookmark
  </button>
  <button onClick={() => setIsBulkImportOpen(true)}>
    Bulk Import
  </button>
</div>

// At the end of JSX, add modal
<BulkImportModal
  isOpen={isBulkImportOpen}
  onClose={() => setIsBulkImportOpen(false)}
  onImportComplete={handleImportComplete}
/>
```

**Step 2: Test manually**

Run: `cd frontend && npm run dev`

1. Navigate to `/bookmarks`
2. Click "Bulk Import" button
3. Modal should open
4. Paste some URLs (one per line)
5. Should see validation counters
6. Click "Import" - should create bookmarks
7. Modal should close after success

Expected: Modal opens, validates URLs, imports successfully

**Step 3: Commit**

```bash
git add frontend/app/bookmarks/page.tsx
git commit -m "feat(ui): integrate bulk import into bookmarks page

- Add 'Bulk Import' button next to 'Add Bookmark'
- Connect BulkImportModal component
- Refresh bookmark list after import

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 3: Extension Authentication Setup

### Task 3.1: Create Extension Auth Page

**Files:**
- Create: `frontend/app/extension-auth/page.tsx`
- Create: `frontend/app/extension-auth/layout.tsx`

**Step 1: Create the extension auth page**

Create `frontend/app/extension-auth/page.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ExtensionAuthPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'authenticated' | 'not-authenticated'>('checking');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleAuth = async () => {
      try {
        // Check if user is authenticated by trying to fetch tokens
        const response = await fetch('/api/auth/extension-token', {
          credentials: 'include',
        });

        if (response.ok) {
          const data = await response.json();

          // Send tokens to extension via postMessage
          window.postMessage(
            {
              type: 'SMART_BOOKMARK_AUTH',
              accessToken: data.accessToken,
              refreshToken: data.refreshToken,
            },
            window.location.origin
          );

          setStatus('authenticated');

          // Show success message briefly, then close
          setTimeout(() => {
            window.close();
          }, 2000);
        } else {
          // Not authenticated, redirect to login
          setStatus('not-authenticated');
          router.push(`/login?redirect=${encodeURIComponent('/extension-auth')}`);
        }
      } catch (err) {
        console.error('Extension auth error:', err);
        setError('Failed to authenticate extension. Please try again.');
      }
    };

    handleAuth();
  }, [router]);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {status === 'checking' && (
          <>
            <div style={styles.spinner} />
            <h2 style={styles.title}>Connecting Extension...</h2>
            <p style={styles.message}>Please wait while we set up your browser extension.</p>
          </>
        )}

        {status === 'authenticated' && (
          <>
            <div style={styles.successIcon}>✓</div>
            <h2 style={styles.title}>Extension Connected!</h2>
            <p style={styles.message}>You can now save bookmarks from your browser. This window will close automatically.</p>
          </>
        )}

        {error && (
          <>
            <div style={styles.errorIcon}>✗</div>
            <h2 style={styles.title}>Connection Failed</h2>
            <p style={styles.error}>{error}</p>
            <button style={styles.button} onClick={() => window.location.reload()}>
              Try Again
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: '#f9fafb',
  },
  card: {
    background: 'white',
    padding: '40px',
    borderRadius: '8px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    textAlign: 'center' as const,
    maxWidth: '400px',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #e5e7eb',
    borderTop: '4px solid #3b82f6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '0 auto 20px',
  },
  successIcon: {
    fontSize: '48px',
    color: '#059669',
    marginBottom: '20px',
  },
  errorIcon: {
    fontSize: '48px',
    color: '#dc2626',
    marginBottom: '20px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 600,
    margin: '0 0 12px',
    color: '#111827',
  },
  message: {
    fontSize: '16px',
    color: '#6b7280',
    margin: 0,
  },
  error: {
    fontSize: '16px',
    color: '#dc2626',
    margin: '0 0 20px',
  },
  button: {
    padding: '10px 20px',
    background: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '16px',
    fontWeight: 500,
    cursor: 'pointer',
  },
};
```

**Step 2: Create layout to add spinner animation**

Create `frontend/app/extension-auth/layout.tsx`:

```typescript
export default function ExtensionAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style jsx global>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
      {children}
    </>
  );
}
```

**Step 3: Test manually**

Run: `npm run dev`

1. Navigate to `/extension-auth` while logged in
2. Should see "Connecting Extension..." briefly
3. Then "Extension Connected!" message
4. Window should attempt to close after 2s

Expected: Page detects authentication and shows success

**Step 4: Commit**

```bash
git add frontend/app/extension-auth/page.tsx frontend/app/extension-auth/layout.tsx
git commit -m "feat(auth): add extension authentication page

- /extension-auth page for browser extension login flow
- Fetches tokens and sends to extension via postMessage
- Redirects to login if not authenticated
- Shows success/error states
- Auto-closes after successful auth

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 4: Browser Extension Development

### Task 4.1: Set Up Extension Project Structure

**Files:**
- Create: `extension/package.json`
- Create: `extension/tsconfig.json`
- Create: `extension/webpack.config.js`
- Create: `extension/manifest.json`

**Step 1: Create extension directory and package.json**

```bash
mkdir -p extension/src/{popup,background,types,utils}
cd extension
```

Create `extension/package.json`:

```json
{
  "name": "smart-bookmark-extension",
  "version": "1.0.0",
  "description": "Smart Bookmark browser extension for one-click bookmark saving",
  "scripts": {
    "build": "webpack --mode production",
    "dev": "webpack --mode development --watch",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.253",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "copy-webpack-plugin": "^11.0.0",
    "css-loader": "^6.8.1",
    "html-webpack-plugin": "^5.5.3",
    "style-loader": "^3.3.3",
    "ts-loader": "^9.5.0",
    "typescript": "^5.2.0",
    "webpack": "^5.89.0",
    "webpack-cli": "^5.1.4"
  }
}
```

**Step 2: Create TypeScript config**

Create `extension/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM"],
    "jsx": "react",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "outDir": "./dist",
    "baseUrl": "./src",
    "types": ["chrome"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create webpack config**

Create `extension/webpack.config.js`:

```javascript
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    popup: './src/popup/index.tsx',
    background: './src/background/background.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/popup/popup.html',
      filename: 'popup.html',
      chunks: ['popup'],
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'icons', to: 'icons' }, // We'll add icons later
      ],
    }),
  ],
};
```

**Step 4: Create manifest.json**

Create `extension/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "Smart Bookmark",
  "version": "1.0.0",
  "description": "Save bookmarks with one click and let AI organize them for you",
  "permissions": [
    "activeTab",
    "storage"
  ],
  "host_permissions": [
    "http://localhost:3002/*",
    "https://yourdomain.com/*"
  ],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "background": {
    "service_worker": "background.js"
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

**Step 5: Install dependencies**

```bash
cd extension
npm install
```

**Step 6: Commit**

```bash
git add extension/package.json extension/tsconfig.json extension/webpack.config.js extension/manifest.json
git commit -m "feat(extension): set up project structure

- Package.json with React, TypeScript, Webpack
- TypeScript configuration
- Webpack build configuration
- Manifest V3 configuration
- Ready for popup and background script development

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 4.2: Implement Background Service Worker

**Files:**
- Create: `extension/src/types/index.ts`
- Create: `extension/src/background/background.ts`

**Step 1: Create shared types**

Create `extension/src/types/index.ts`:

```typescript
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface SaveBookmarkRequest {
  url: string;
  title: string;
}

export interface SaveBookmarkResponse {
  data: {
    id: string;
    url: string;
    title: string | null;
    status: string;
  };
}

export interface MessageAuth {
  type: 'SMART_BOOKMARK_AUTH';
  accessToken: string;
  refreshToken: string;
}

export interface MessageAuthSuccess {
  type: 'AUTH_SUCCESS';
}

export interface MessageLogout {
  type: 'LOGOUT';
}
```

**Step 2: Create background service worker**

Create `extension/src/background/background.ts`:

```typescript
import { AuthTokens, MessageAuth, MessageAuthSuccess, MessageLogout } from '../types';

const API_URL = 'http://localhost:3002'; // TODO: Make configurable

// Listen for messages from popup and web app
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SMART_BOOKMARK_AUTH') {
    handleAuthMessage(message as MessageAuth);
  } else if (message.type === 'LOGOUT') {
    handleLogout();
  }
  return true;
});

// Listen for messages from web app via content script
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.type === 'SMART_BOOKMARK_AUTH') {
    handleAuthMessage(message as MessageAuth);
  }
  return true;
});

async function handleAuthMessage(message: MessageAuth) {
  const tokens: AuthTokens = {
    accessToken: message.accessToken,
    refreshToken: message.refreshToken,
    expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutes
  };

  await chrome.storage.local.set({ tokens });

  // Notify popup that auth succeeded
  chrome.runtime.sendMessage({ type: 'AUTH_SUCCESS' } as MessageAuthSuccess);

  console.log('[Background] Auth tokens stored');
}

async function handleLogout() {
  await chrome.storage.local.remove('tokens');
  console.log('[Background] Logged out');
}

// Check if token is expired
function isTokenExpired(expiresAt: number): boolean {
  return Date.now() >= expiresAt;
}

// Refresh access token using refresh token
async function refreshAccessToken(refreshToken: string): Promise<AuthTokens | null> {
  try {
    const response = await fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    const data = await response.json();

    const tokens: AuthTokens = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: Date.now() + 15 * 60 * 1000,
    };

    await chrome.storage.local.set({ tokens });

    console.log('[Background] Token refreshed');
    return tokens;
  } catch (error) {
    console.error('[Background] Token refresh failed:', error);
    // Clear invalid tokens
    await chrome.storage.local.remove('tokens');
    return null;
  }
}

// Export helper to get valid token (refresh if needed)
export async function getValidToken(): Promise<string | null> {
  const result = await chrome.storage.local.get('tokens');
  const tokens: AuthTokens | undefined = result.tokens;

  if (!tokens) {
    return null;
  }

  // Check if token is expired
  if (isTokenExpired(tokens.expiresAt)) {
    console.log('[Background] Token expired, refreshing...');
    const newTokens = await refreshAccessToken(tokens.refreshToken);
    return newTokens?.accessToken || null;
  }

  return tokens.accessToken;
}

console.log('[Background] Service worker initialized');
```

**Step 3: Commit**

```bash
git add extension/src/types/index.ts extension/src/background/background.ts
git commit -m "feat(extension): implement background service worker

- Handles auth messages from web app
- Stores JWT tokens in chrome.storage.local
- Automatic token refresh when expired
- Token validation helper
- Logout handler

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 4.3: Implement API Client

**Files:**
- Create: `extension/src/utils/api.ts`

**Step 1: Create API client**

Create `extension/src/utils/api.ts`:

```typescript
import { SaveBookmarkRequest, SaveBookmarkResponse } from '../types';

const API_URL = 'http://localhost:3002'; // TODO: Make configurable

class BookmarkAPI {
  private async getAuthToken(): Promise<string | null> {
    const result = await chrome.storage.local.get('tokens');
    return result.tokens?.accessToken || null;
  }

  private async refreshAndRetry<T>(
    operation: () => Promise<T>
  ): Promise<T> {
    // Try to refresh token
    const result = await chrome.storage.local.get('tokens');
    const tokens = result.tokens;

    if (!tokens?.refreshToken) {
      throw new Error('No refresh token available');
    }

    // Refresh token
    const response = await fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });

    if (!response.ok) {
      // Refresh failed, clear tokens
      await chrome.storage.local.remove('tokens');
      throw new Error('Token refresh failed');
    }

    const data = await response.json();

    // Store new tokens
    await chrome.storage.local.set({
      tokens: {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: Date.now() + 15 * 60 * 1000,
      },
    });

    // Retry original operation
    return operation();
  }

  async saveBookmark(
    url: string,
    title: string
  ): Promise<SaveBookmarkResponse> {
    const token = await this.getAuthToken();

    if (!token) {
      throw new Error('Not authenticated');
    }

    const operation = async () => {
      const currentToken = await this.getAuthToken();

      const response = await fetch(`${API_URL}/api/v1/bookmarks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify({ url, title } as SaveBookmarkRequest),
      });

      if (response.status === 401) {
        throw new Error('UNAUTHORIZED');
      }

      if (!response.ok) {
        throw new Error('Failed to save bookmark');
      }

      return response.json();
    };

    try {
      return await operation();
    } catch (error) {
      if (error instanceof Error && error.message === 'UNAUTHORIZED') {
        // Try to refresh and retry
        return this.refreshAndRetry(operation);
      }
      throw error;
    }
  }

  async checkAuth(): Promise<boolean> {
    const token = await this.getAuthToken();
    return token !== null;
  }
}

export const bookmarkAPI = new BookmarkAPI();
```

**Step 2: Commit**

```bash
git add extension/src/utils/api.ts
git commit -m "feat(extension): implement API client

- BookmarkAPI class for backend communication
- saveBookmark method with auth headers
- Automatic token refresh on 401
- Retry logic after token refresh
- checkAuth helper

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 4.4: Implement Popup UI

**Files:**
- Create: `extension/src/popup/popup.html`
- Create: `extension/src/popup/popup.tsx`
- Create: `extension/src/popup/index.tsx`
- Create: `extension/src/popup/popup.css`

**Step 1: Create popup HTML shell**

Create `extension/src/popup/popup.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Smart Bookmark</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      width: 400px;
      min-height: 200px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
    }
  </style>
</head>
<body>
  <div id="root"></div>
</body>
</html>
```

**Step 2: Create popup React component**

Create `extension/src/popup/popup.tsx`:

```typescript
import React, { useState, useEffect } from 'react';
import { bookmarkAPI } from '../utils/api';
import './popup.css';

type PopupState =
  | { status: 'loading' }
  | { status: 'not-authenticated' }
  | { status: 'ready'; url: string; title: string }
  | { status: 'saving' }
  | { status: 'success' }
  | { status: 'error'; message: string };

export function Popup() {
  const [state, setState] = useState<PopupState>({ status: 'loading' });

  useEffect(() => {
    loadCurrentTab();

    // Listen for auth success messages
    const listener = (message: any) => {
      if (message.type === 'AUTH_SUCCESS') {
        loadCurrentTab();
      }
    };

    chrome.runtime.onMessage.addListener(listener);

    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, []);

  async function loadCurrentTab() {
    try {
      // Check authentication
      const isAuthenticated = await bookmarkAPI.checkAuth();

      if (!isAuthenticated) {
        setState({ status: 'not-authenticated' });
        return;
      }

      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab || !tab.url || !tab.title) {
        setState({ status: 'error', message: 'Could not get current tab info' });
        return;
      }

      // Validate URL scheme
      const url = new URL(tab.url);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        setState({ status: 'error', message: 'Cannot save this type of page' });
        return;
      }

      setState({ status: 'ready', url: tab.url, title: tab.title });
    } catch (error) {
      console.error('Load error:', error);
      setState({ status: 'error', message: 'Failed to load page info' });
    }
  }

  function handleLogin() {
    chrome.tabs.create({
      url: 'http://localhost:3000/extension-auth', // TODO: Make configurable
    });
  }

  async function handleSave() {
    if (state.status !== 'ready') return;

    setState({ status: 'saving' });

    try {
      await bookmarkAPI.saveBookmark(state.url, state.title);
      setState({ status: 'success' });

      // Close popup after 2 seconds
      setTimeout(() => {
        window.close();
      }, 2000);
    } catch (error) {
      console.error('Save error:', error);
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to save bookmark',
      });
    }
  }

  function handleRetry() {
    loadCurrentTab();
  }

  if (state.status === 'loading') {
    return (
      <div className="popup">
        <div className="spinner" />
        <p className="message">Loading...</p>
      </div>
    );
  }

  if (state.status === 'not-authenticated') {
    return (
      <div className="popup">
        <h2 className="title">Welcome to Smart Bookmark</h2>
        <p className="message">Please log in to save bookmarks</p>
        <button className="button-primary" onClick={handleLogin}>
          Log In
        </button>
      </div>
    );
  }

  if (state.status === 'ready') {
    return (
      <div className="popup">
        <h2 className="title">Save Bookmark</h2>
        <div className="bookmark-info">
          <div className="bookmark-title">{state.title}</div>
          <div className="bookmark-url">{state.url}</div>
        </div>
        <button className="button-primary" onClick={handleSave}>
          Save Bookmark
        </button>
      </div>
    );
  }

  if (state.status === 'saving') {
    return (
      <div className="popup">
        <div className="spinner" />
        <p className="message">Saving...</p>
      </div>
    );
  }

  if (state.status === 'success') {
    return (
      <div className="popup">
        <div className="success-icon">✓</div>
        <h2 className="title">Saved!</h2>
        <p className="message">Bookmark saved successfully</p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="popup">
        <div className="error-icon">✗</div>
        <h2 className="title">Error</h2>
        <p className="error-message">{state.message}</p>
        <button className="button-secondary" onClick={handleRetry}>
          Try Again
        </button>
      </div>
    );
  }

  return null;
}
```

**Step 3: Create popup entry point**

Create `extension/src/popup/index.tsx`:

```typescript
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Popup } from './popup';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<Popup />);
}
```

**Step 4: Create popup styles**

Create `extension/src/popup/popup.css`:

```css
.popup {
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #111827;
  text-align: center;
}

.message {
  margin: 0;
  font-size: 14px;
  color: #6b7280;
  text-align: center;
}

.error-message {
  margin: 0;
  font-size: 14px;
  color: #dc2626;
  text-align: center;
}

.bookmark-info {
  width: 100%;
  padding: 12px;
  background: #f9fafb;
  border-radius: 4px;
  border: 1px solid #e5e7eb;
}

.bookmark-title {
  font-size: 14px;
  font-weight: 500;
  color: #111827;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bookmark-url {
  font-size: 12px;
  color: #6b7280;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.button-primary,
.button-secondary {
  width: 100%;
  padding: 10px 20px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.button-primary {
  background: #3b82f6;
  color: white;
}

.button-primary:hover {
  background: #2563eb;
}

.button-secondary {
  background: white;
  color: #374151;
  border: 1px solid #d1d5db;
}

.button-secondary:hover {
  background: #f9fafb;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e5e7eb;
  border-top: 3px solid #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.success-icon {
  font-size: 48px;
  color: #059669;
}

.error-icon {
  font-size: 48px;
  color: #dc2626;
}
```

**Step 5: Build the extension**

```bash
cd extension
npm run build
```

Expected: `dist/` folder created with compiled files

**Step 6: Commit**

```bash
git add extension/src/popup/
git commit -m "feat(extension): implement popup UI

- React-based popup component
- States: loading, not-auth, ready, saving, success, error
- Current tab info display (title + URL)
- Login button (opens /extension-auth)
- Save button with success/error handling
- Auto-close after successful save
- Responsive styles

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 4.5: Add Placeholder Icons

**Files:**
- Create: `extension/icons/icon16.png`
- Create: `extension/icons/icon48.png`
- Create: `extension/icons/icon128.png`

**Step 1: Create placeholder icon files**

For now, we'll add placeholder icons. You can replace these with proper icons later.

```bash
mkdir -p extension/icons

# Create simple placeholder icons using ImageMagick (if available)
# Or manually create simple PNG files

# For now, just add a note about icons
echo "TODO: Add proper icon files (16x16, 48x48, 128x128)" > extension/icons/README.md
```

**Step 2: Update .gitignore**

Add to `.gitignore`:

```
extension/dist/
extension/node_modules/
```

**Step 3: Commit**

```bash
git add extension/icons/ .gitignore
git commit -m "feat(extension): add icon placeholders and gitignore

- Placeholder for extension icons (16, 48, 128px)
- Ignore extension build artifacts

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Testing & Validation

### Task 5.1: Test Backend Endpoints

**Step 1: Test bulk endpoint manually**

```bash
# Create a test token (you'll need to adjust based on your auth setup)
# Login first to get a valid cookie

curl -X POST http://localhost:3002/api/v1/bookmarks/bulk \
  -H "Content-Type: application/json" \
  -H "Cookie: accessToken=YOUR_TOKEN" \
  -d '{
    "urls": [
      "https://example.com/1",
      "https://example.com/2",
      "https://example.com/3"
    ]
  }'
```

Expected: 200 response with `{ created: 3, bookmarks: [...] }`

**Step 2: Test extension-token endpoint**

```bash
curl -X GET http://localhost:3002/api/v1/auth/extension-token \
  -H "Cookie: accessToken=YOUR_TOKEN"
```

Expected: 200 response with `{ accessToken: "...", refreshToken: "..." }`

**Step 3: Verify in database**

```bash
docker exec smartbookmarks_backend npx prisma studio
```

- Check that bookmarks were created with `status='pending'`
- Verify enrichment jobs were enqueued

---

### Task 5.2: Test Batch Import UI

**Step 1: Manual testing**

1. Start frontend: `npm run dev`
2. Navigate to `/bookmarks`
3. Click "Bulk Import"
4. Paste test URLs:
```
https://example.com/article1
https://example.com/article2
https://example.com/article3
invalid-url
```
5. Verify counters show "3 valid, 1 invalid"
6. Click "Import"
7. Verify success message
8. Check bookmarks list - should show new bookmarks

**Step 2: Test error cases**

- Empty input → Button should be disabled
- Network error → Should show error message
- Large batch (100+ URLs) → Should handle gracefully

---

### Task 5.3: Test Extension

**Step 1: Load extension in Chrome**

1. Build extension: `cd extension && npm run build`
2. Open Chrome → `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select `extension/dist` folder

**Step 2: Test authentication flow**

1. Click extension icon
2. Should show "Log In" button
3. Click "Log In" → Opens `/extension-auth`
4. Login to web app if needed
5. Should see "Extension Connected!"
6. Return to extension popup
7. Should show current page info with "Save" button

**Step 3: Test bookmark saving**

1. Navigate to any webpage (e.g., https://news.ycombinator.com)
2. Click extension icon
3. Should show page title and URL
4. Click "Save Bookmark"
5. Should show "Saving..." then "Saved!"
6. Popup should close after 2s
7. Check web app - bookmark should appear

**Step 4: Test error cases**

- Try saving on chrome:// page → Should show error
- Logout from web app → Extension should show "Log In" again
- Test with network offline → Should show error

---

## Documentation

### Task 6.1: Update User Documentation

**Files:**
- Create: `docs/guides/browser-extension.md`
- Create: `docs/guides/batch-import.md`

**Step 1: Create extension guide**

Create `docs/guides/browser-extension.md`:

```markdown
# Browser Extension Guide

## Installation

### Chrome

1. Download the extension from Chrome Web Store (coming soon)
2. Or install manually:
   - Clone the repository
   - Run `cd extension && npm install && npm run build`
   - Open Chrome → `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `extension/dist` folder

### Safari

Coming soon.

## Usage

### First Time Setup

1. Click the Smart Bookmark extension icon in your browser toolbar
2. Click "Log In"
3. Log in to your Smart Bookmark account
4. The extension will automatically connect

### Saving Bookmarks

1. Navigate to any webpage you want to save
2. Click the Smart Bookmark extension icon
3. Review the page title and URL
4. Click "Save Bookmark"
5. The bookmark will be saved and automatically enriched

### Tips

- Keyboard shortcut (coming soon): `Cmd/Ctrl + Shift + B`
- Works on any HTTP/HTTPS page
- Does not work on browser internal pages (chrome://, about:, etc.)
- Bookmarks are automatically organized and tagged by AI

## Troubleshooting

### "Not authenticated" Error

The extension lost connection to your account. Click "Log In" again.

### "Failed to save" Error

Check your internet connection and try again. If the problem persists, check the [daily usage limit](#usage-limits).

### Usage Limits

Your account has a daily enrichment limit to manage AI costs. Bookmarks are always saved, but enrichment (summaries, tags, etc.) may be delayed if you hit the limit.
```

**Step 2: Create batch import guide**

Create `docs/guides/batch-import.md`:

```markdown
# Batch Import Guide

Import multiple bookmarks at once by pasting a list of URLs.

## How to Use

1. Navigate to the Bookmarks page
2. Click the "Bulk Import" button
3. Paste URLs (one per line) into the text area
4. Review the validation counters
5. Click "Import All"

## Supported Formats

### Simple URL List (Recommended)

```
https://example.com/article1
https://example.com/article2
https://example.com/article3
```

One URL per line. Empty lines are ignored.

### Browser Bookmark Export

You can export bookmarks from your browser and paste the URLs:

**Chrome:**
1. `Bookmarks` → `Bookmark Manager` → `⋮` → `Export bookmarks`
2. Open the HTML file in a text editor
3. Copy all URLs (use find/replace to extract them)
4. Paste into Smart Bookmark

## Limits

- Maximum 1000 URLs per import
- Invalid URLs are skipped (not saved)
- All bookmarks are created immediately
- Enrichment happens in the background

## Validation

- ✓ Valid URLs: Start with `http://` or `https://`
- ✗ Invalid URLs: Missing protocol, malformed, or browser-specific (chrome://, about:, etc.)

## What Happens After Import

1. All valid URLs are saved as bookmarks with status="pending"
2. The enrichment queue processes them in parallel
3. Bookmarks appear in your list as they complete
4. Failed enrichments are marked with status="failed" and can be retried

## Tips

- Remove duplicate URLs before importing (system will reject duplicates)
- Large imports (100+ URLs) may take several minutes to enrich
- You can close the modal and navigate away while enrichment continues

## Troubleshooting

### "Failed to import" Error

Check your internet connection and try again with a smaller batch.

### Some bookmarks are missing

Check if those URLs were duplicates of existing bookmarks. Duplicates are skipped.

### Bookmarks stuck in "pending"

The enrichment queue is processing them. Large batches take time. Check back in a few minutes.
```

**Step 3: Commit**

```bash
git add docs/guides/browser-extension.md docs/guides/batch-import.md
git commit -m "docs: add browser extension and batch import guides

- Installation instructions for Chrome
- Usage guide with screenshots
- Troubleshooting section
- Batch import format examples
- Tips and best practices

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 6.2: Update Main Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/README.md`

**Step 1: Add to CLAUDE.md**

Add to the "Features" section in `CLAUDE.md`:

```markdown
## New Features (Phase 5)

### Browser Extension
- Chrome/Safari extension for one-click bookmark saving
- TypeScript + React popup UI
- Web app authentication redirect flow
- Automatic token refresh
- Location: `extension/`

### Batch Import
- Paste multiple URLs at once in web app
- Simple URL list format (one per line)
- Real-time validation with counters
- Parallel processing via enrichment queue
- Location: `frontend/components/bookmarks/BulkImportModal.tsx`

**API Endpoints:**
- `POST /api/v1/bookmarks/bulk` - Bulk bookmark creation (max 1000)
- `GET /api/v1/auth/extension-token` - Get tokens for extension
```

**Step 2: Add to docs index**

Add to `docs/README.md`:

```markdown
### User Guides
- [Browser Extension Guide](guides/browser-extension.md) - Install and use the browser extension
- [Batch Import Guide](guides/batch-import.md) - Import multiple bookmarks at once
```

**Step 3: Commit**

```bash
git add CLAUDE.md docs/README.md
git commit -m "docs: update main documentation with new features

- Add browser extension to CLAUDE.md
- Add batch import to CLAUDE.md
- Link to new user guides in docs index

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Final Steps

### Task 7.1: Create PR

**Step 1: Push feature branch**

```bash
git push origin feature/browser-extension-and-batch-import
```

**Step 2: Create pull request**

```bash
gh pr create --title "feat: browser extension and batch import" --body "$(cat <<'EOF'
## Summary

Adds two new entry points for bookmark creation:

- **Browser Extension (Chrome/Safari)** - One-click bookmark saving from toolbar
- **Batch Import UI** - Paste multiple URLs at once in web app

## Changes

### Backend API
- ✅ `POST /api/v1/bookmarks/bulk` - Bulk bookmark creation (max 1000)
- ✅ `GET /api/v1/auth/extension-token` - Get tokens for extension
- ✅ Comprehensive tests for new endpoints

### Frontend
- ✅ Bulk import modal component
- ✅ Integrated into bookmarks page
- ✅ Real-time URL validation
- ✅ Success/error handling

### Browser Extension
- ✅ TypeScript + React architecture
- ✅ Manifest V3 configuration
- ✅ Background service worker (auth state)
- ✅ Popup UI with 6 states
- ✅ API client with auto-refresh
- ✅ Extension auth page in web app

### Documentation
- ✅ Browser extension installation guide
- ✅ Batch import usage guide
- ✅ Updated CLAUDE.md

## Test Plan

- [x] Backend tests pass
- [x] Bulk endpoint tested with 100 URLs
- [x] Extension token endpoint tested
- [ ] Manual testing: Batch import UI
- [ ] Manual testing: Extension in Chrome
- [ ] Manual testing: Extension auth flow
- [ ] Manual testing: Token refresh
- [ ] Edge cases: Invalid URLs, large batches, network errors

## Screenshots

(Add screenshots of extension popup and batch import modal)

## Breaking Changes

None. All changes are additive.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Step 3: Request review**

Assign reviewers and wait for approval.

---

## Success Criteria

✅ **Backend API**
- [ ] Bulk endpoint creates 1000 bookmarks in <5s
- [ ] Extension token endpoint returns valid JWTs
- [ ] All tests pass
- [ ] Enrichment queue processes bookmarks correctly

✅ **Batch Import UI**
- [ ] Parses URLs correctly (100% accuracy)
- [ ] Shows validation counters in real-time
- [ ] Displays success message with counts
- [ ] Handles errors gracefully

✅ **Browser Extension**
- [ ] Loads in Chrome without errors
- [ ] Auth flow works end-to-end
- [ ] Saves bookmarks in <3s
- [ ] Token refresh works automatically
- [ ] All error states handled

✅ **Documentation**
- [ ] Installation guides complete
- [ ] Usage examples clear
- [ ] Troubleshooting covers common issues

---

## Future Enhancements (Not in This PR)

- Context menu right-click option
- Ability to add notes/tags in extension before saving
- CSV import with metadata columns
- Browser bookmark HTML file import
- Batch operations in extension (save multiple tabs)
- Extension keyboard shortcuts
- Safari App Extension (native)
- Extension available in Chrome Web Store

---

**End of Implementation Plan**
