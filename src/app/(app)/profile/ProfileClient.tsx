'use client';

import { useState } from 'react';
import { LogOut, KeyRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { apiFetch, ApiError } from '@/lib/hooks/useApi';

export function ProfileClient({
  name,
  email,
  role,
  orgName,
  avatarColor,
}: {
  name: string;
  email: string;
  role: string;
  orgName: string;
  avatarColor: string;
}) {
  const router = useRouter();
  const toast = useToast();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);

  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

  async function changePassword() {
    setBusy(true);
    setFieldErrors({});
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: current, newPassword: next, confirmPassword: confirm }),
      });
      setCurrent('');
      setNext('');
      setConfirm('');
      toast.success('Password changed. Other devices have been signed out.');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fieldErrors) setFieldErrors(err.fieldErrors);
        toast.error(err.message);
      } else {
        toast.error('Could not change your password');
      }
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-4 sm:px-6">
      <Card>
        <CardBody className="flex items-center gap-4">
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white"
            style={{ backgroundColor: avatarColor }}
          >
            {initials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-slate-900">{name}</p>
            <p className="truncate text-sm text-slate-500">{email}</p>
            <p className="mt-0.5 text-xs text-slate-400">
              {role} · {orgName}
            </p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <KeyRound className="h-4 w-4 text-slate-400" />
            Change password
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <Input
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            error={fieldErrors.currentPassword?.[0]}
          />
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            error={fieldErrors.newPassword?.[0]}
            hint="At least 8 characters with a letter and a number"
          />
          <Input
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={fieldErrors.confirmPassword?.[0]}
          />
          <Button
            fullWidth
            onClick={changePassword}
            loading={busy}
            disabled={!current || next.length < 8 || next !== confirm}
          >
            Change password
          </Button>
        </CardBody>
      </Card>

      <Button variant="outline" fullWidth onClick={logout}>
        <LogOut className="h-4 w-4" />
        Sign out
      </Button>
    </div>
  );
}
