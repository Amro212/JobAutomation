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
  Rocket,
  HelpCircle,
  LogOut,
  Loader2
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

  if (!apiConnected) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-background text-foreground overflow-hidden">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-headline font-bold text-3xl mb-8 shadow-lg">
          S
        </div>
        <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
        <h1 className="text-2xl font-bold font-headline tracking-tight">Sahara AI</h1>
        <p className="text-sm text-muted-foreground mt-2">Loading...</p>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="grid h-screen overflow-hidden transition-[grid-template-columns] duration-300"
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
            "flex items-center gap-3 py-5 border-b border-sidebar-border min-h-[72px]",
            sidebarCollapsed ? "justify-center px-0" : "px-4"
          )}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-headline font-bold text-lg">
              S
            </div>
            {!sidebarCollapsed && (
              <div className="flex flex-col overflow-hidden">
                <span className="font-headline text-lg font-bold text-foreground tracking-tight truncate">
                  Sahara AI
                </span>
                <span className="text-xs text-muted-foreground font-semibold truncate">
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
                    <span className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/90">
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
                                    ? 'bg-sidebar-accent text-sidebar-primary font-bold'
                                    : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground'
                                )
                              }
                            >
                              <Icon className="h-5 w-5" strokeWidth={1.8} />
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
                              'flex items-center gap-3 px-2 py-1.5 rounded-lg text-sm font-semibold transition-colors duration-200',
                              isActive
                                ? 'bg-sidebar-accent text-sidebar-primary font-bold'
                                : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground'
                            )
                          }
                        >
                          <div className="flex h-8 w-8 items-center justify-center shrink-0">
                            <Icon className="h-5 w-5" strokeWidth={1.8} />
                          </div>
                          <span className="truncate py-0.5 leading-normal">{item.label}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </ScrollArea>

          {/* Sidebar Footer */}
          <div className={cn("border-t border-sidebar-border space-y-2", sidebarCollapsed ? "p-2 px-1" : "p-4 px-2")}>
            <Button
              className={cn(
                "font-label font-semibold shadow-sm transition-colors flex items-center justify-center gap-2 relative overflow-hidden",
                !sidebarCollapsed ? "w-full py-2.5" : "h-10 w-10 p-0 mx-auto flex-shrink-0"
              )}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
              <Rocket className={cn("shrink-0 z-10 relative", sidebarCollapsed ? "h-5 w-5" : "h-4 w-4")} />
              {!sidebarCollapsed && <span className="z-10 relative">Launch Autopilot</span>}
            </Button>
            
            {!sidebarCollapsed && (
              <div className="flex flex-col space-y-1 mt-2">
                <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground h-10 px-2 gap-3">
                  <div className="flex h-8 w-8 items-center justify-center shrink-0">
                    <HelpCircle className="h-5 w-5" />
                  </div>
                  Help
                </Button>
                <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-destructive h-10 px-2 gap-3">
                  <div className="flex h-8 w-8 items-center justify-center shrink-0">
                    <LogOut className="h-5 w-5" />
                  </div>
                  Logout
                </Button>
              </div>
            )}

            <Separator className={cn("my-2", sidebarCollapsed && "w-10 mx-auto")} />

            {/* Collapse Toggle */}
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "justify-center text-muted-foreground hover:text-foreground flex-shrink-0",
                !sidebarCollapsed ? "w-full h-8" : "h-10 w-10 p-0 mx-auto"
              )}
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? (
                <ChevronRight className="h-5 w-5" />
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
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-muted/40 text-xs font-semibold text-foreground">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-[pulse_2s_infinite]" />
                System Active
              </div>

              {/* Notifications */}
              <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground" aria-label="Notifications">
                <Bell className="h-4 w-4" />
              </Button>

              {/* Theme Toggle */}
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-foreground"
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
