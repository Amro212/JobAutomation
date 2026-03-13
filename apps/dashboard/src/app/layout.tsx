import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'JobAutomation',
  description: 'Local-first job automation control panel'
};

const navItems = [
  { href: '/', label: 'Overview' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/runs', label: 'Runs' },
  { href: '/setup', label: 'Setup' }
];

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>): JSX.Element {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen">
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">JobAutomation</p>
                <h1 className="text-lg font-semibold text-slate-900">Control Panel</h1>
              </div>
              <nav className="flex gap-4" aria-label="Primary">
                {navItems.map((item) => (
                  <Link key={item.href} href={item.href} className="text-sm font-medium text-slate-600 transition hover:text-slate-900">{item.label}</Link>
                ))}
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
