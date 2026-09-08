'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, KeyRound, MoreVertical, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Input, Select, Checkbox } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { apiFetch, ApiError } from '@/lib/hooks/useApi';
import { ROLE_OPTIONS, ROLE_LABELS, type Role } from '@/lib/constants/enums';
import { formatRelative } from '@/lib/utils/dates';

interface Member {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  isActive: boolean;
  lastLoginAt?: string;
  avatarColor: string;
  isSelf: boolean;
}

/** Roles an admin may grant — SUPER_ADMIN is never offered in the UI. */
const ASSIGNABLE_ROLES = ROLE_OPTIONS.filter((r) => r.value !== 'SUPER_ADMIN' && r.value !== 'ADMIN');

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

export function TeamClient({ members: initial }: { members: Member[] }) {
  const router = useRouter();
  const toast = useToast();

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [resetting, setResetting] = useState<Member | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => router.refresh();

  async function removeMember() {
    if (!removing) return;
    setBusy(true);
    try {
      await apiFetch(`/api/team/manage?userId=${removing.id}`, { method: 'DELETE' });
      toast.success(`${removing.name} removed`);
      setRemoving(null);
      refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not remove that member');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3 px-4 py-4 sm:px-6">
      <Button fullWidth onClick={() => setAddOpen(true)}>
        <UserPlus className="h-4 w-4" />
        Add team member
      </Button>

      {initial.map((m) => (
        <Card key={m.id}>
          <CardBody className="flex items-center gap-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
              style={{ backgroundColor: m.avatarColor }}
            >
              {initials(m.name)}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm font-semibold text-slate-900">{m.name}</p>
                {m.isSelf && (
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                    You
                  </span>
                )}
                {!m.isActive && (
                  <span className="shrink-0 rounded bg-danger-50 px-1.5 py-0.5 text-[10px] font-medium text-danger-600">
                    Inactive
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-slate-500">{m.email}</p>
              <p className="mt-0.5 text-xs text-slate-400">
                {ROLE_LABELS[m.role]}
                {m.lastLoginAt && ` · last seen ${formatRelative(m.lastLoginAt)}`}
              </p>
            </div>

            <div className="flex shrink-0 gap-1">
              <button
                onClick={() => setResetting(m)}
                className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label={`Reset password for ${m.name}`}
                title="Reset password"
              >
                <KeyRound className="h-4 w-4" />
              </button>
              {!m.isSelf && (
                <button
                  onClick={() => setEditing(m)}
                  className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label={`Edit ${m.name}`}
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              )}
            </div>
          </CardBody>
        </Card>
      ))}

      <AddMemberModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onDone={() => {
          setAddOpen(false);
          toast.success('Team member added');
          refresh();
        }}
        onError={(m) => toast.error(m)}
      />

      <EditMemberModal
        key={editing?.id ?? 'none'}
        member={editing}
        onClose={() => setEditing(null)}
        onDone={() => {
          setEditing(null);
          toast.success('Saved');
          refresh();
        }}
        onRemove={(m) => {
          setEditing(null);
          setRemoving(m);
        }}
        onError={(m) => toast.error(m)}
      />

      <ResetPasswordModal
        key={resetting?.id ?? 'none'}
        member={resetting}
        onClose={() => setResetting(null)}
        onDone={() => {
          setResetting(null);
          toast.success('Password reset. Share the new password with them directly.');
        }}
        onError={(m) => toast.error(m)}
      />

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={removeMember}
        title={`Remove ${removing?.name}?`}
        message="They will lose access immediately. Their leads and activity history are kept."
        confirmLabel="Remove"
        loading={busy}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function AddMemberModal({
  open,
  onClose,
  onDone,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: 'SALES' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setFieldErrors({});
    try {
      await apiFetch('/api/team/manage', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone || undefined,
          password: form.password,
          role: form.role,
        }),
      });
      setForm({ name: '', email: '', phone: '', password: '', role: 'SALES' });
      onDone();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fieldErrors) setFieldErrors(err.fieldErrors);
        onError(err.message);
      } else {
        onError('Could not add that member');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add team member"
      footer={
        <>
          <Button variant="outline" fullWidth onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button fullWidth onClick={submit} loading={busy}>
            Add
          </Button>
        </>
      }
    >
      <div className="space-y-4 py-1">
        <Input
          label="Name"
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          error={fieldErrors.name?.[0]}
        />
        <Input
          label="Email"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          error={fieldErrors.email?.[0]}
          hint="They will use this to sign in"
        />
        <Input
          label="Phone"
          type="tel"
          inputMode="tel"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          error={fieldErrors.phone?.[0]}
        />
        <Input
          label="Password"
          type="text"
          required
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          error={fieldErrors.password?.[0]}
          hint="At least 8 characters with a letter and a number. Share it with them directly — they can change it after signing in."
        />
        <Select
          label="Role"
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
          options={ASSIGNABLE_ROLES.map((r) => ({ value: r.value, label: `${r.label} — ${r.description}` }))}
        />
      </div>
    </Modal>
  );
}

function EditMemberModal({
  member,
  onClose,
  onDone,
  onRemove,
  onError,
}: {
  member: Member | null;
  onClose: () => void;
  onDone: () => void;
  onRemove: (m: Member) => void;
  onError: (m: string) => void;
}) {
  const [role, setRole] = useState<string>(member?.role ?? 'SALES');
  const [isActive, setIsActive] = useState(member?.isActive ?? true);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!member) return;
    setBusy(true);
    try {
      await apiFetch('/api/team/manage', {
        method: 'PATCH',
        body: JSON.stringify({ userId: member.id, updates: { role, isActive } }),
      });
      onDone();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={!!member}
      onClose={onClose}
      title={member?.name}
      description={member?.email}
      size="sm"
      footer={
        <>
          <Button variant="outline" fullWidth onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button fullWidth onClick={submit} loading={busy}>
            Save
          </Button>
        </>
      }
    >
      {member && (
        <div className="space-y-4 py-1">
          <Select
            label="Role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            options={ASSIGNABLE_ROLES.map((r) => ({ value: r.value, label: r.label }))}
          />
          <Checkbox
            label="Account is active"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <button
            type="button"
            onClick={() => onRemove(member)}
            className="text-sm font-medium text-danger-600 hover:underline"
          >
            Remove from team
          </button>
        </div>
      )}
    </Modal>
  );
}

function ResetPasswordModal({
  member,
  onClose,
  onDone,
  onError,
}: {
  member: Member | null;
  onClose: () => void;
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!member) return;
    setBusy(true);
    try {
      await apiFetch('/api/team/manage', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'RESET_PASSWORD', userId: member.id, newPassword: password }),
      });
      setPassword('');
      onDone();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not reset the password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={!!member}
      onClose={onClose}
      title="Reset password"
      description={member?.name}
      size="sm"
      footer={
        <>
          <Button variant="outline" fullWidth onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button fullWidth onClick={submit} loading={busy} disabled={password.length < 8}>
            Reset
          </Button>
        </>
      }
    >
      <div className="space-y-3 py-1">
        <div className="flex items-start gap-2 rounded-md bg-slate-100 px-3 py-2.5">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <p className="text-xs text-slate-600">
            This signs them out of every device. Share the new password with them directly — it is
            not emailed.
          </p>
        </div>
        <Input
          label="New password"
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="At least 8 characters with a letter and a number"
        />
      </div>
    </Modal>
  );
}
