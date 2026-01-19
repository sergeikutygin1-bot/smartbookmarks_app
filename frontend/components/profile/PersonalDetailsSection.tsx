'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUpdateEmail, useChangePassword } from '@/hooks/useProfile';
import { usePasswordValidation } from '@/hooks/usePasswordValidation';
import { format } from 'date-fns';

interface PersonalDetailsSectionProps {
  user: any;
}

export default function PersonalDetailsSection({ user }: PersonalDetailsSectionProps) {
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const updateEmailMutation = useUpdateEmail();
  const changePasswordMutation = useChangePassword();
  const passwordValidation = usePasswordValidation(newPassword);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateEmailMutation.mutateAsync(newEmail);
    setIsEditingEmail(false);
    setNewEmail('');
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      return;
    }

    if (!passwordValidation.valid) {
      return;
    }

    await changePasswordMutation.mutateAsync({
      currentPassword,
      newPassword,
      confirmPassword,
    });

    setIsChangingPassword(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Account Information */}
      <Card className="p-8 bg-card border border-border shadow-sm">
        <h2 className="text-2xl font-serif font-semibold mb-6 tracking-tight">
          Account Information
        </h2>

        <div className="space-y-4">
          {/* Email */}
          <div>
            <Label className="text-sm uppercase tracking-wide text-muted-foreground font-medium">
              Email
            </Label>
            {!isEditingEmail ? (
              <div className="flex items-center justify-between mt-2">
                <p className="text-foreground">{user?.email}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setNewEmail(user?.email || '');
                    setIsEditingEmail(true);
                  }}
                  className="text-sm"
                >
                  Change Email
                </Button>
              </div>
            ) : (
              <form onSubmit={handleEmailSubmit} className="mt-2 space-y-2">
                <Input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="new.email@example.com"
                  className="bg-card border-border"
                />
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={updateEmailMutation.isPending}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    {updateEmailMutation.isPending ? 'Saving...' : 'Save'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsEditingEmail(false);
                      setNewEmail('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </div>

          {/* Member Since */}
          <div>
            <Label className="text-sm uppercase tracking-wide text-muted-foreground font-medium">
              Member Since
            </Label>
            <p className="text-foreground mt-2">
              {user?.createdAt ? format(new Date(user.createdAt), 'MMMM d, yyyy') : '-'}
            </p>
          </div>
        </div>
      </Card>

      {/* Change Password */}
      <Card className="p-8 bg-card border border-border shadow-sm">
        <h2 className="text-2xl font-serif font-semibold mb-6 tracking-tight">
          Password
        </h2>

        {!isChangingPassword ? (
          <Button
            variant="outline"
            onClick={() => setIsChangingPassword(true)}
          >
            Change Password
          </Button>
        ) : (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="mt-2 bg-card border-border"
              />
            </div>

            <div>
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="mt-2 bg-card border-border"
              />
              {newPassword && !passwordValidation.valid && (
                <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  <p className="font-medium mb-1">Password must have:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {passwordValidation.errors.map((error, idx) => (
                      <li key={idx}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="mt-2 bg-card border-border"
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                  Passwords don't match
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={
                  changePasswordMutation.isPending ||
                  !passwordValidation.valid ||
                  newPassword !== confirmPassword
                }
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {changePasswordMutation.isPending ? 'Changing...' : 'Change Password'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsChangingPassword(false);
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
