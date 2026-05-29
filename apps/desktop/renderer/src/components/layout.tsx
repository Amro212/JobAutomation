import { NavLink, Outlet } from 'react-router';

import { ApiConnectionGuard } from '@renderer/components/api-connection-guard';

const navItems = [
  { to: '/autopilot', label: 'Autopilot' },
  { to: '/jobs', label: 'Jobs' },
  { to: '/autopilot-runs', label: 'Autopilot Runs' },
  { to: '/runs', label: 'Discovery Runs' },
  { to: '/applications', label: 'Applications' }
];

export function DesktopLayout() {
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
          <div className="status-pill">Renderer online</div>
          <p className="muted">API process status will surface here as the migration continues.</p>
        </div>
      </aside>

      <main className="content">
        <ApiConnectionGuard />
        <Outlet />
      </main>
    </div>
  );
}
