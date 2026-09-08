'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Checkbox } from '@/components/ui/Input';
import { apiFetch, ApiError } from '@/lib/hooks/useApi';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, rememberMe }),
      });

      // Only allow relative redirects — an absolute `next` value would let a
      // crafted link bounce a freshly authenticated user to another site.
      const next = searchParams.get('next');
      const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';

      // `refresh()` clears the router cache so server components re-read the
      // new session cookie instead of rendering the signed-out shell.
      router.replace(target);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {error && (
        <div
          className="flex items-start gap-2 rounded-md border border-danger-200 bg-danger-50 px-3 py-2.5 text-sm text-danger-700"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Input
        type="email"
        label="Email"
        placeholder="you@company.com"
        autoComplete="username"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        leftIcon={<Mail className="h-4 w-4" />}
        disabled={submitting}
      />

      <Input
        type={showPassword ? 'text' : 'password'}
        label="Password"
        placeholder="Enter your password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        leftIcon={<Lock className="h-4 w-4" />}
        disabled={submitting}
        rightSlot={
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="rounded-md p-2 text-slate-400 hover:text-slate-600"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        }
      />

      <Checkbox
        label="Keep me signed in for 30 days"
        checked={rememberMe}
        onChange={(e) => setRememberMe(e.target.checked)}
        disabled={submitting}
      />

      <Button type="submit" fullWidth size="lg" loading={submitting}>
        Sign in
      </Button>
    </form>
  );
}
