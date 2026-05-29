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
    <div className="desktop-shell">
      <aside className="sidebar">
        <div className="brand">
          <small>JobAutomation</small>
          <strong>Desktop Control Panel</strong>
          <span className="muted">Electron shell for the migration plan.</span>
        </div>

        <nav className="nav-list" aria-label="Desktop navigation">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                isActive ? 'nav-link active' : 'nav-link'
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="status-pill">
            {camoufoxStatus.state === 'ready' ? 'Runtime ready' : 'Runtime setup'}
          </div>
          <p className="muted">{backendStatus}</p>
          <p className="muted">
            {camoufoxStatus.state === 'ready'
              ? 'Camoufox downloaded'
              : camoufoxStatus.message}
          </p>
        </div>
      </aside>

      <main className="content">
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
