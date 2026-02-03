"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authenticatedFetch } from "@/lib/api";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3002';

export default function ExtensionAuthPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'success' | 'error'>('checking');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const authenticateExtension = async () => {
      try {
        // Step 1: Check if user is authenticated by trying to fetch their profile
        const authCheckResponse = await authenticatedFetch(`${BACKEND_URL}/api/v1/auth/me`, {
          method: 'GET',
        });

        if (!authCheckResponse.ok) {
          // Not authenticated, redirect to login with return URL
          const returnUrl = encodeURIComponent('/extension-auth');
          router.push(`/login?returnUrl=${returnUrl}`);
          return;
        }

        // Step 2: User is authenticated, fetch tokens for extension
        const tokensResponse = await authenticatedFetch(`${BACKEND_URL}/api/v1/auth/extension-token`, {
          method: 'GET',
        });

        if (!tokensResponse.ok) {
          throw new Error('Failed to fetch extension tokens');
        }

        const tokens = await tokensResponse.json();

        // Step 3: Send tokens to extension via postMessage
        window.postMessage({
          type: 'SMART_BOOKMARK_AUTH',
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken
        }, window.location.origin);

        // Step 4: Show success message
        setStatus('success');

        // Step 5: Auto-close tab after 2 seconds
        setTimeout(() => {
          window.close();
        }, 2000);

      } catch (error) {
        console.error('[Extension Auth] Error:', error);

        // If authentication failed (401), redirect to login
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        if (errorMsg.includes('Unauthorized') || errorMsg.includes('401')) {
          const returnUrl = encodeURIComponent('/extension-auth');
          router.push(`/login?returnUrl=${returnUrl}`);
          return;
        }

        // For other errors, show error message
        setStatus('error');
        setErrorMessage(errorMsg);
      }
    };

    authenticateExtension();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-md p-8 bg-white dark:bg-slate-800 rounded-2xl shadow-xl">
        {status === 'checking' && (
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Checking Authentication...
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              Please wait while we connect your extension
            </p>
          </div>
        )}

        {status === 'success' && (
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full mb-4">
              <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Extension Connected!
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              Your browser extension is now connected. This tab will close automatically.
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full mb-4">
              <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Failed to Connect Extension
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              {errorMessage || 'An error occurred while connecting your extension'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
