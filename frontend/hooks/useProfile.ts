import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { profileApi } from '@/lib/api';
import { toast } from 'sonner';

/**
 * Query key factory for profile
 */
export const profileKeys = {
  all: ['profile'] as const,
  profile: () => [...profileKeys.all, 'data'] as const,
};

/**
 * Fetch current user profile
 */
export function useProfile() {
  return useQuery({
    queryKey: profileKeys.profile(),
    queryFn: () => profileApi.getProfile(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Update user email
 */
export function useUpdateEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (newEmail: string) => profileApi.updateEmail(newEmail),
    onSuccess: (data) => {
      queryClient.setQueryData(profileKeys.profile(), data);
      queryClient.invalidateQueries({ queryKey: profileKeys.profile() });
      toast.success('Email updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update email');
    },
  });
}

/**
 * Change user password
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: (data: {
      currentPassword: string;
      newPassword: string;
      confirmPassword: string;
    }) => profileApi.changePassword(data),
    onSuccess: () => {
      toast.success('Password changed successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to change password');
    },
  });
}
