import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Suspense } from 'react';

import { Toaster } from '@/components/ui/sonner';
import { FlashToast } from '@/components/flash-toast';
import { NavLink } from '@/components/nav-link';

import './globals.css';

export const metadata: Metadata = {
  title: 'JobAutomation',
  description: 'Local-first job automation control panel'
};

const navItems = [
  { href: '/', label: 'Overview' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/shortlist', label: 'Shortlist' },
  { href: '/runs', label: 'Runs' },
  { href: '/setup', label: 'Setup' }
];

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen">
          <header className="sticky top-0 z-50 border-b bg-card">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  JobAutomation
                </p>
                <h1 className="text-lg font-semibold text-foreground">Control Panel</h1>
              </div>
              <nav className="flex gap-1" aria-label="Primary">
                {navItems.map((item) => (
                  <NavLink key={item.href} href={item.href} label={item.label} />
                ))}
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
        </div>
        <Toaster position="bottom-right" richColors closeButton />
        <Suspense>
          <FlashToast />
        </Suspense>
      </body>
    </html>
  );
}
