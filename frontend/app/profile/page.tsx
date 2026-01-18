'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProfilePanelStore } from '@/store/profilePanelStore';

export default function ProfilePage() {
  const router = useRouter();
  const { open } = useProfilePanelStore();

  useEffect(() => {
    // Open the profile panel
    open();
    // Redirect to home
    router.push('/');
  }, [open, router]);

  return null;
}
