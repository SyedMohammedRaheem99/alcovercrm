'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker.
 *
 * Registration is skipped in development, where an aggressive cache fights hot
 * reload and produces confusing stale-page bugs.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Registration failing is not fatal — the app works without it.
      });
    };

    // Register after load so it never competes with the first paint.
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
