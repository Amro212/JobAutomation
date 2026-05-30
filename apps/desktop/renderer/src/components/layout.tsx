import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router';

import { ApiConnectionGuard } from '@renderer/components/api-connection-guard';
import { CamoufoxSetupBanner } from '@renderer/components/camoufox-setup-banner';
import { useCamoufoxStatus } from '@renderer/lib/use-camoufox-status';

const navItems = [
  { to: '/autopilot', label: 'Autopilot' },
  { to: '/jobs', label: 'Jobs' },
  { to: '/autopilot-runs', label: 'Autopilot Runs' },
  { to: '/runs', label: 'Discovery Runs' },
  { to: '/applications', label: 'Applications' }
];

export function DesktopLayout() {
  const [backendStatus, setBackendStatus] = useState('Connecting backend...');
  const { status: camoufoxStatus } = useCamoufoxStatus();

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) {
      setBackendStatus('Browser mode');
      return;
    }

    void api.getBackendStatus().then((status) => {
      setBackendStatus(formatBackendStatus(status));
    });

    return api.onBackendStatus((status) => {
      setBackendStatus(formatBackendStatus(status));
    });
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] min-h-screen bg-background text-foreground">
      <aside className="border-r border-border bg-card/40 backdrop-blur-3xl p-6 flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <small className="tracking-widest uppercase text-sky-400 text-xs font-semibold">JobAutomation</small>
          <strong className="text-xl font-bold tracking-tight">Control Panel</strong>
          <span className="text-sm text-muted-foreground">Electron shell for the migration plan.</span>
        </div>

        <nav className="flex flex-col gap-2" aria-label="Desktop navigation">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `px-4 py-3 rounded-2xl text-sm font-medium transition-all duration-200 ${
                  isActive 
                    ? 'text-sky-50 border border-sky-400/30 bg-blue-600/20 shadow-[0_8px_32px_rgba(37,99,235,0.15)]' 
                    : 'text-slate-400 border border-transparent hover:bg-slate-800/40 hover:text-slate-200'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto rounded-3xl border border-border bg-card/60 p-5 flex flex-col gap-3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-300 w-fit">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${camoufoxStatus.state === 'ready' ? 'bg-sky-400' : 'bg-amber-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${camoufoxStatus.state === 'ready' ? 'bg-sky-500' : 'bg-amber-500'}`}></span>
            </span>
            {camoufoxStatus.state === 'ready' ? 'Runtime ready' : 'Runtime setup'}
          </div>
          <p className="text-sm text-muted-foreground font-medium">{backendStatus}</p>
          <p className="text-xs text-slate-500">
            {camoufoxStatus.state === 'ready'
              ? 'Camoufox downloaded'
              : camoufoxStatus.message}
          </p>
        </div>
      </aside>

      <main className="p-8 relative overflow-y-auto">
        <ApiConnectionGuard />
        <CamoufoxSetupBanner />
        <Outlet />
      </main>
    </div>
  );
}

function formatBackendStatus(
  status:
    | { status: 'stopped' }
    | { status: 'starting' }
    | { status: 'running' }
    | { status: 'stopping' }
    | { status: 'restarting'; attempt: number; delayMs: number }
    | { status: 'error'; message: string }
): string {
  switch (status.status) {
    case 'running':
      return 'Backend connected';
    case 'starting':
      return 'Backend starting';
    case 'stopping':
      return 'Backend stopping';
    case 'stopped':
      return 'Backend stopped';
    case 'restarting':
      return `Backend restarting (attempt ${status.attempt})`;
    case 'error':
      return `Backend error: ${status.message}`;
  }
}
