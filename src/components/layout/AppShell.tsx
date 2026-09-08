'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  CalendarClock,
  KanbanSquare,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Plus,
  MapPin,
  Upload,
  Database,
  MoreHorizontal,
  UserCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Logo, LogoMark } from '@/components/ui/Logo';
import { apiFetch } from '@/lib/hooks/useApi';
import type { Permission } from '@/lib/auth/permissions';

export interface ShellUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarColor: string;
  orgName: string;
  permissions: Permission[];
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  permission?: Permission;
  /** Shown in the mobile bottom bar (max 4 + the add button). */
  primary?: boolean;
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, primary: true },
  { href: '/leads', label: 'Leads', icon: Users, primary: true },
  { href: '/follow-ups', label: 'Follow-ups', icon: CalendarClock, primary: true },
  { href: '/pipeline', label: 'Pipeline', icon: KanbanSquare },
  { href: '/site-visits', label: 'Site Visits', icon: MapPin },
  { href: '/reports', label: 'Reports', icon: BarChart3, permission: 'report:view_all' },
  { href: '/import', label: 'Import', icon: Upload, permission: 'lead:import' },
  { href: '/backup', label: 'Backup', icon: Database, permission: 'backup:run' },
  { href: '/settings', label: 'Settings', icon: Settings, permission: 'settings:manage' },
];

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const visibleNav = NAV.filter((item) => !item.permission || user.permissions.includes(item.permission));
  const bottomNav = visibleNav.filter((item) => item.primary).slice(0, 3);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  async function handleLogout() {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* ---------------- Desktop sidebar ---------------- */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-16 items-center border-b border-slate-200 px-5">
          <Link href="/dashboard">
            <Logo />
          </Link>
        </div>

        <nav className="scrollbar-thin flex-1 space-y-0.5 overflow-y-auto p-3">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive(item.href)
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <Link
            href="/profile"
            className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-slate-50"
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{ backgroundColor: user.avatarColor }}
            >
              {initials(user.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">{user.name}</span>
              <span className="block truncate text-xs text-slate-500">{user.orgName}</span>
            </span>
          </Link>
          <button
            onClick={handleLogout}
            className="mt-1 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-danger-600"
          >
            <LogOut className="h-[18px] w-[18px]" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ---------------- Main column ---------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="safe-top sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
          <Link href="/dashboard" className="flex items-center gap-2">
            <LogoMark className="h-7 w-7" color="#1E3A8A" />
            <span className="text-base font-semibold text-brand-700">Alcove</span>
          </Link>
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="-mr-2 rounded-md p-2 text-slate-600 hover:bg-slate-100"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </header>

        {/* pb-20 leaves room for the fixed bottom nav on mobile */}
        <main className="min-w-0 flex-1 pb-20 lg:pb-0">{children}</main>
      </div>

      {/* ---------------- Mobile bottom nav ---------------- */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-slate-200 bg-white lg:hidden">
        {bottomNav.slice(0, 2).map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium',
                isActive(item.href) ? 'text-brand-700' : 'text-slate-500',
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}

        {/* Quick Add sits in the centre — the single most frequent action. */}
        <div className="flex flex-1 justify-center">
          <Link
            href="/leads/new?quick=1"
            className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-accent-500 text-white shadow-lg active:bg-accent-600"
            aria-label="Add lead"
          >
            <Plus className="h-6 w-6" strokeWidth={2.5} />
          </Link>
        </div>

        {bottomNav.slice(2).map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium',
                isActive(item.href) ? 'text-brand-700' : 'text-slate-500',
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}

        <button
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium text-slate-500"
        >
          <MoreHorizontal className="h-5 w-5" />
          More
        </button>
      </nav>

      {/* ---------------- Mobile drawer ---------------- */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-slate-900/50"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 top-0 flex h-full w-72 animate-slide-up flex-col bg-white shadow-lg">
            <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
              <span className="text-sm font-semibold text-slate-900">Menu</span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="scrollbar-thin flex-1 space-y-0.5 overflow-y-auto p-3">
              {visibleNav.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium',
                      isActive(item.href) ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-50',
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-slate-200 p-3">
              <Link
                href="/profile"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <UserCircle className="h-5 w-5" />
                {user.name}
              </Link>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-sm font-medium text-danger-600 hover:bg-danger-50"
              >
                <LogOut className="h-5 w-5" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
