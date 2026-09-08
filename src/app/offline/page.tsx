import { WifiOff } from 'lucide-react';

export const metadata = { title: 'Offline' };

/** Shown by the service worker when a navigation fails with no network. */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <WifiOff className="h-7 w-7" />
        </div>
        <h1 className="text-lg font-semibold text-slate-900">You are offline</h1>
        <p className="mt-1 max-w-xs text-sm text-slate-500">
          Check your mobile data or Wi-Fi connection. Your saved work is safe — reload once you are
          back online.
        </p>
      </div>
    </main>
  );
}
