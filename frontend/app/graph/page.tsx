'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useViewModeStore } from '@/store/viewModeStore';

export default function GraphPage() {
  const router = useRouter();
  const { setMode } = useViewModeStore();

  useEffect(() => {
    // Set mode to graph and redirect to home
    setMode('graph');
    router.replace('/');
  }, [router, setMode]);

  return null;
}
