import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LoginForm } from './LoginForm';
import { Logo } from '@/components/ui/Logo';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col bg-canvas">
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center">
            <Logo className="mb-5" />
            <h1 className="text-xl font-semibold text-slate-900">Sign in to your account</h1>
            <p className="mt-1 text-sm text-slate-500">Manage your leads and follow-ups</p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            {/* useSearchParams needs a Suspense boundary in the App Router. */}
            <Suspense fallback={<div className="h-64" />}>
              <LoginForm />
            </Suspense>
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">
            Forgot your password? Ask your administrator to reset it.
          </p>
        </div>
      </div>
    </main>
  );
}
