'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    const token = searchParams.get('token');

    if (!token) {
      setStatus('error');
      toast.error('Invalid verification link');
      return;
    }

    fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3002'}/api/v1/auth/verify-email?token=${token}`, {
      credentials: 'include',
    })
      .then(async (res) => {
        if (res.ok) {
          setStatus('success');
          toast.success('Email verified successfully!');
          setTimeout(() => router.push('/'), 2000);
        } else {
          const data = await res.json();
          setStatus('error');
          toast.error(data.message || data.error || 'Verification failed');
        }
      })
      .catch(() => {
        setStatus('error');
        toast.error('Verification failed');
      });
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full text-center p-8 bg-white rounded-lg shadow-md">
        {status === 'loading' && (
          <div>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Verifying your email...</p>
          </div>
        )}
        {status === 'success' && (
          <div>
            <div className="mx-auto mb-4 h-12 w-12 flex items-center justify-center rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-green-600 mb-2">Email Verified!</h1>
            <p className="text-gray-600">Redirecting you to the app...</p>
          </div>
        )}
        {status === 'error' && (
          <div>
            <div className="mx-auto mb-4 h-12 w-12 flex items-center justify-center rounded-full bg-red-100">
              <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-red-600 mb-2">Verification Failed</h1>
            <p className="text-gray-600 mb-4">The link may have expired or is invalid.</p>
            <button
              onClick={() => router.push('/login')}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Go to Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
