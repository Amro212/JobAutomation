import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import {
  LayoutDashboard,
  Zap,
  Briefcase,
  Star,
  Send,
  FolderOpen,
  Search,
  Play,
  Settings,
  Sun,
  Moon,
  Bell,
  ChevronLeft,
  ChevronRight,
  Activity
} from 'lucide-react';

import { ApiConnectionGuard } from '@renderer/components/api-connection-guard';
import { CamoufoxSetupBanner } from '@renderer/components/camoufox-setup-banner';
import { useCamoufoxStatus } from '@renderer/lib/use-camoufox-status';
import { useTheme } from '@renderer/components/theme-provider';
import { cn } from '@renderer/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';

/* ──────────────────────────────────────────────────────────────
   Navigation Config
   ────────────────────────────────────────────────────────────── */

const navSections = [
  {
    label: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/autopilot', label: 'Autopilot', icon: Zap }
    ]
  },
  {
    label: 'Workspace',
    items: [
      { to: '/jobs', label: 'Jobs', icon: Briefcase },
      { to: '/shortlist', label: 'Shortlist', icon: Star },
      { to: '/submitted', label: 'Submitted', icon: Send },
      { to: '/applications', label: 'Applications', icon: FolderOpen }
    ]
  },
  {
    label: 'History',
    items: [
      { to: '/runs', label: 'Discovery Runs', icon: Search },
      { to: '/autopilot-runs', label: 'Autopilot Runs', icon: Play }
    ]
  },
  {
    label: 'Configuration',
    items: [{ to: '/setup', label: 'Setup', icon: Settings }]
  }
];

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/autopilot': 'Autopilot',
  '/jobs': 'Jobs',
  '/shortlist': 'Shortlist',
  '/submitted': 'Submitted',
  '/applications': 'Applications',
  '/runs': 'Discovery Runs',
  '/autopilot-runs': 'Autopilot Runs',
  '/setup': 'Setup & Profile'
};

/* ──────────────────────────────────────────────────────────────
   Layout Component
   ────────────────────────────────────────────────────────────── */

export function DesktopLayout() {
  const [backendStatus, setBackendStatus] = useState('Connecting...');
  const [rawStatus, setRawStatus] = useState<string>('stopped');
  const { status: camoufoxStatus } = useCamoufoxStatus();
  const { resolvedTheme, setTheme } = useTheme();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) {
      setBackendStatus('Browser mode');
      setRawStatus('running');
      return;
    }

    void api.getBackendStatus().then((status) => {
      setBackendStatus(formatBackendStatus(status));
      setRawStatus(status.status);
    });

    return api.onBackendStatus((status) => {
      setBackendStatus(formatBackendStatus(status));
      setRawStatus(status.status);
    });
  }, []);

  const apiConnected = rawStatus === 'running';

  const currentPageTitle =
    pageTitles[location.pathname] ??
    pageTitles[
      Object.keys(pageTitles).find((key) =>
        location.pathname.startsWith(key)
      ) ?? ''
    ] ??
    'JobAutomation';

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="grid min-h-screen overflow-hidden transition-[grid-template-columns] duration-300"
        style={{
          gridTemplateColumns: sidebarCollapsed ? '64px 1fr' : '256px 1fr'
        }}
      >
        {/* ── Sidebar ──────────────────────────────────────── */}
        <aside
          className={cn(
            'relative flex flex-col border-r border-sidebar-border bg-sidebar-background select-none overflow-hidden',
            'transition-all duration-300'
          )}
          aria-label="Main navigation"
        >
          {/* Brand */}
          <div className={cn(
            "flex items-center gap-3 px-4 py-5 border-b border-sidebar-border min-h-[72px]",
            sidebarCollapsed && "justify-center px-0"
          )}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-headline font-bold text-lg">
              S
            </div>
            {!sidebarCollapsed && (
              <div className="flex flex-col overflow-hidden">
                <span className="font-headline text-lg font-bold text-foreground tracking-tight truncate">
                  Sahara AI
                </span>
                <span className="text-[11px] text-muted-foreground font-medium truncate">
                  Automation Suite
                </span>
              </div>
            )}
          </div>

          {/* Navigation */}
          <ScrollArea className="flex-1 py-3">
            <nav className="flex flex-col gap-1 px-2">
              {navSections.map((section) => (
                <div key={section.label} className="mb-2">
                  {!sidebarCollapsed && (
                    <span className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {section.label}
                    </span>
                  )}
                  <div className="flex flex-col gap-0.5 mt-1">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      return sidebarCollapsed ? (
                        <Tooltip key={item.to}>
                          <TooltipTrigger asChild>
                            <NavLink
                               to={item.to}
                              className={({ isActive }) =>
                                cn(
                                  'flex items-center justify-center h-10 w-10 mx-auto rounded-lg transition-colors duration-200',
                                  isActive
                                    ? 'bg-sidebar-accent text-sidebar-primary font-semibold'
                                    : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground'
                                )
                              }
                            >
                              <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                            </NavLink>
                          </TooltipTrigger>
                          <TooltipContent side="right">{item.label}</TooltipContent>
                        </Tooltip>
                      ) : (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          className={({ isActive }) =>
                            cn(
                              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200',
                              isActive
                                ? 'bg-sidebar-accent text-sidebar-primary font-semibold'
                                : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground'
                            )
                          }
                        >
                          <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
                          <span className="truncate">{item.label}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </ScrollArea>

          {/* Sidebar Footer */}
          <div className={cn("border-t border-sidebar-border p-3 space-y-3", sidebarCollapsed && "p-2 px-1")}>
            {/* Health Indicators */}
            <div className={cn('flex flex-col gap-2', sidebarCollapsed && 'items-center')}>
              {/* API Status */}
              <div
                className={cn(
                  'inline-flex items-center gap-2 rounded-md text-[11px] font-semibold justify-center',
                  sidebarCollapsed ? 'p-1.5 h-10 w-10 mx-auto' : 'px-2.5 py-1.5',
                  apiConnected
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                )}
              >
                <span className="relative flex h-2 w-2 shrink-0">
                  <span
                    className={cn(
                      'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
                      apiConnected ? 'bg-emerald-500' : 'bg-red-500'
                    )}
                  />
                  <span
                    className={cn(
                      'relative inline-flex rounded-full h-2 w-2',
                      apiConnected ? 'bg-emerald-500' : 'bg-red-500'
                    )}
                  />
                </span>
                {!sidebarCollapsed && (apiConnected ? 'API Connected' : 'API Offline')}
              </div>

              {/* Camoufox Status */}
              <div
                className={cn(
                  'inline-flex items-center gap-2 rounded-md text-[11px] font-semibold justify-center',
                  sidebarCollapsed ? 'p-1.5 h-10 w-10 mx-auto' : 'px-2.5 py-1.5',
                  camoufoxStatus.state === 'ready'
                    ? 'text-sky-600 dark:text-sky-400'
                    : 'text-amber-600 dark:text-amber-400'
                )}
              >
                <Activity className="h-3.5 w-3.5 shrink-0" />
                {!sidebarCollapsed &&
                  (camoufoxStatus.state === 'ready'
                    ? 'Camoufox Ready'
                    : 'Camoufox Setup')}
              </div>
            </div>

            {!sidebarCollapsed && (
              <p className="text-[11px] text-muted-foreground truncate px-1">
                {backendStatus}
              </p>
            )}

            <Separator />

            {/* Collapse Toggle */}
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-center h-8"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </Button>
          </div>
        </aside>

        {/* ── Main Content Area ─────────────────────────────── */}
        <div className="flex flex-col h-screen overflow-hidden">
          {/* Top Header */}
          <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/90 backdrop-blur-md px-6">
            <h1 className="font-headline text-xl font-bold tracking-tight text-foreground">
              {currentPageTitle}
            </h1>

            <div className="flex items-center gap-3">
              {/* System Status Pill */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-muted/40 text-xs font-semibold text-muted-foreground">
                <span
                  className={cn(
                    'h-2 w-2 rounded-full',
                    apiConnected
                      ? 'bg-emerald-500 animate-pulse-dot'
                      : 'bg-red-500'
                  )}
                />
                {apiConnected ? 'System Active' : 'Offline'}
              </div>

              {/* Notifications */}
              <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Notifications">
                <Bell className="h-4 w-4" />
              </Button>

              {/* Theme Toggle */}
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={toggleTheme}
                aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
              >
                {resolvedTheme === 'dark' ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>
            </div>
          </header>

          {/* Page Content */}
          <main className="flex-1 overflow-y-auto">
            <div className="max-w-6xl mx-auto p-6 lg:p-8 space-y-6">
              <ApiConnectionGuard />
              <CamoufoxSetupBanner />
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

/* ──────────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────────── */

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
      return 'Fastify listening';
    case 'starting':
      return 'Launching server...';
    case 'stopping':
      return 'Stopping server...';
    case 'stopped':
      return 'Offline';
    case 'restarting':
      return `Reconnecting (Attempt ${status.attempt})`;
    case 'error':
      return `Failure: ${status.message}`;
  }
}
