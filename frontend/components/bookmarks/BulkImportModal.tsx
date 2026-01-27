'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { authenticatedFetch } from '@/lib/api';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import styles from './BulkImportModal.module.css';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type ImportState = 'idle' | 'loading' | 'success' | 'error';

export default function BulkImportModal({ isOpen, onClose, onSuccess }: BulkImportModalProps) {
  const [input, setInput] = useState('');
  const [state, setState] = useState<ImportState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [importedCount, setImportedCount] = useState(0);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setInput('');
      setState('idle');
      setErrorMessage('');
      setImportedCount(0);
    }
  }, [isOpen]);

  // Parse and validate URLs in real-time
  const { validUrls, invalidUrls } = useMemo(() => {
    const lines = input
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    const urlRegex = /^https?:\/\/.+/i;
    const valid: string[] = [];
    const invalid: string[] = [];

    lines.forEach(line => {
      if (urlRegex.test(line)) {
        valid.push(line);
      } else {
        invalid.push(line);
      }
    });

    return { validUrls: valid, invalidUrls: invalid };
  }, [input]);

  const handleImport = async () => {
    if (validUrls.length === 0) return;

    setState('loading');
    setErrorMessage('');

    try {
      const response = await authenticatedFetch('/api/bookmarks/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: validUrls }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to import bookmarks' }));
        throw new Error(errorData.error || 'Failed to import bookmarks');
      }

      const data = await response.json();
      setImportedCount(data.created || validUrls.length);
      setState('success');

      // Auto-close after 3 seconds
      setTimeout(() => {
        onClose();
        onSuccess();
      }, 3000);
    } catch (error) {
      setState('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to import bookmarks');
    }
  };

  const handleRetry = () => {
    setState('idle');
    setErrorMessage('');
    // Automatically trigger import after resetting state
    handleImport();
  };

  // Determine button text and disabled state
  const isLoading = state === 'loading';
  const isDisabled = validUrls.length === 0 || isLoading;
  const buttonText = isLoading ? 'Importing...' : 'Import All';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Bulk Import Bookmarks</DialogTitle>
          <DialogDescription>
            Paste URLs below (one per line). Only http:// and https:// URLs are supported.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Success Message */}
          {state === 'success' && (
            <div className={styles.successMessage}>
              <CheckCircle2 className="h-5 w-5" />
              <span>
                {importedCount} bookmark{importedCount !== 1 ? 's' : ''} imported successfully!
              </span>
            </div>
          )}

          {/* Error Message */}
          {state === 'error' && (
            <div className={styles.errorMessage}>
              <AlertCircle className="h-5 w-5" />
              <div className="flex-1">
                <p className="font-medium">Failed to import bookmarks</p>
                <p className="text-sm">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Textarea */}
          <div className="space-y-2">
            <label htmlFor="urls" className="text-sm font-medium">
              URLs
            </label>
            <Textarea
              id="urls"
              placeholder="Paste URLs here (one per line)&#10;https://example.com&#10;https://another-site.org"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
              className="min-h-[200px] font-mono text-sm"
              autoFocus
            />
          </div>

          {/* URL Counters */}
          <div className={styles.counters}>
            <div className={styles.counter}>
              <span className={styles.counterValue}>{validUrls.length}</span>
              <span className={styles.counterLabel}>
                valid url{validUrls.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className={styles.counterSeparator}>•</div>
            <div className={styles.counter}>
              <span className={`${styles.counterValue} ${invalidUrls.length > 0 ? styles.counterError : ''}`}>
                {invalidUrls.length}
              </span>
              <span className={styles.counterLabel}>
                invalid url{invalidUrls.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          {state === 'error' ? (
            <>
              <Button onClick={handleRetry} variant="outline" className="flex-1">
                Retry
              </Button>
              <Button onClick={onClose} variant="secondary" className="flex-1">
                Close
              </Button>
            </>
          ) : (
            <>
              <Button onClick={onClose} variant="outline" disabled={isLoading}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={isDisabled}
                className="flex-1 gap-2"
              >
                {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {buttonText}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
