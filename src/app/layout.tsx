import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { ToastProvider } from '@/components/ui/Toast';
import { ServiceWorkerRegistrar } from '@/components/layout/ServiceWorkerRegistrar';
import './globals.css';

/**
 * Self-hosted via next/font: no external request at runtime, so the app still
 * renders correctly when installed as a PWA and opened offline.
 */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: 'Alcove CRM',
    template: '%s · Alcove CRM',
  },
  description: 'Lead management for doors, windows and fenestration businesses.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Alcove CRM',
  },
  formatDetection: {
    // Stops iOS auto-linking numbers in body text; we render our own call links.
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#1E3A8A',
  width: 'device-width',
  initialScale: 1,
  // Zoom stays enabled: disabling it fails WCAG 1.4.4 and hurts older users,
  // who are a real part of this client's staff.
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen font-sans">
        <ToastProvider>{children}</ToastProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
