'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';

export function VerificationBanner() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3002'}/api/v1/auth/me`, {
      credentials: 'include',
    })
      .then((res) => {
        if (res.ok) {
          return res.json();
        }
        throw new Error('Not authenticated');
      })
      .then((data) => setUser(data.user))
      .catch((error) => {
        // Silently fail if not authenticated
        console.debug('Not authenticated:', error);
      });
  }, []);

  if (!user || user.emailVerified || dismissed) return null;

  const handleResend = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3002'}/api/v1/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: user.email }),
      });

      if (res.ok) {
        toast.success('Verification email sent! Check your inbox.');
      } else {
        const data = await res.json();
        toast.error(data.message || data.error || 'Failed to send email');
      }
    } catch {
      toast.error('Failed to send email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-yellow-700">
              Please verify your email address to ensure full access to all features.
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleResend}
            disabled={loading}
            className="text-sm text-yellow-700 underline hover:text-yellow-900 disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Resend Email'}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="text-yellow-700 hover:text-yellow-900"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
