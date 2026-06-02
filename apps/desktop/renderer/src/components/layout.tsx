import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
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
  Minus,
  Square,
  X
} from 'lucide-react';
import { toast } from 'sonner';

import { ApiConnectionGuard } from '@renderer/components/api-connection-guard';
import { CamoufoxSetupBanner } from '@renderer/components/camoufox-setup-banner';
import { SaharaLogo } from '@renderer/components/sahara-logo';
import { useCamoufoxStatus } from '@renderer/lib/use-camoufox-status';
import { useTheme } from '@renderer/components/theme-provider';
import { getAutopilotRuns } from '@renderer/lib/api';

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9 text-muted-foreground hover:text-foreground"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {resolvedTheme === 'dark' ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}
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
import RotatingText from '@/components/ui/rotating-text';
import { WindBackground } from '@renderer/components/wind-background';

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

function WindowControls() {
  const electronAPI = typeof window !== 'undefined' ? (window as any).electronAPI : null;

  if (!electronAPI) return null;

  return (
    <div className="flex h-full items-center">
      <button
        onClick={() => electronAPI.minimizeWindow()}
        className="h-full px-4 inline-flex items-center justify-center hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground"
        aria-label="Minimize"
      >
        <Minus className="h-4 w-4" />
      </button>
      <button
        onClick={() => electronAPI.maximizeWindow()}
        className="h-full px-4 inline-flex items-center justify-center hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground"
        aria-label="Maximize"
      >
        <Square className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => electronAPI.closeWindow()}
        className="h-full px-4 inline-flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors text-muted-foreground"
        aria-label="Close"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

const rotatingWords = [
  "resumes",
  "applicants",
  "jobs",
  "cover letters",
  "applications",
  "tasks",
  "pipelines",
  "workflows",
  "openings",
  "automations"
];

function SaharaLoadingScreen() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-testid="sahara-loading-screen"
      className="relative flex h-screen w-screen flex-col items-center justify-center bg-background text-foreground overflow-hidden"
    >
      <WindBackground />

      <style>{`
        @keyframes loading-slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        .animate-loading-slide {
          animation: loading-slide 1.5s ease-in-out infinite;
        }
      `}</style>

      {/* Foreground Content */}
      <div className="z-10 flex flex-col items-center max-w-xs w-full px-6">
        {/* Logo */}
        <SaharaLogo
          variant="light"
          className="h-24 w-24 mb-10 rounded-2xl"
        />

        {/* Progress Container */}
        <div className="w-full flex flex-col items-center gap-4">
          {/* Quirky Message */}
          <div className="flex flex-nowrap justify-center items-center min-h-8 md:min-h-10 w-full mb-1 whitespace-nowrap text-sm md:text-base font-bold uppercase tracking-[0.15em] text-muted-foreground">
            <span className="mr-2 shrink-0">Preparing the</span>
            <RotatingText
              texts={rotatingWords}
              mainClassName="inline-flex shrink-0 bg-primary text-primary-foreground px-2 py-0.5 rounded-md"
              staggerFrom="last"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "-120%" }}
              staggerDuration={0.025}
              splitLevelClassName="overflow-hidden pb-0.5 sm:pb-1 md:pb-1"
              transition={{ type: "spring", damping: 30, stiffness: 400 }}
              rotationInterval={1500}
              randomize={true}
            />
          </div>

          {/* Indeterminate Progress Bar */}
          <div className="h-1 w-full bg-muted rounded-full overflow-hidden relative">
            <div className="absolute top-0 bottom-0 left-0 w-1/2 bg-gradient-to-r from-primary/10 via-primary to-primary/10 rounded-full animate-loading-slide" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function DesktopLayout() {
  const [backendStatus, setBackendStatus] = useState('Connecting...');
  const [rawStatus, setRawStatus] = useState<string>('stopped');
  const [hasActiveAutopilotRun, setHasActiveAutopilotRun] = useState(false);
  const { status: camoufoxStatus } = useCamoufoxStatus();
  const location = useLocation();
  const navigate = useNavigate();
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

  useEffect(() => {
    if (!apiConnected) {
      setHasActiveAutopilotRun(false);
      return;
    }

    let cancelled = false;
    const refreshActiveRun = async () => {
      try {
        const runs = await getAutopilotRuns();
        if (!cancelled) {
          setHasActiveAutopilotRun(
            runs.some(({ run }) => ['pending', 'running'].includes(run.status))
          );
        }
      } catch {
        if (!cancelled) {
          setHasActiveAutopilotRun(false);
        }
      }
    };

    void refreshActiveRun();
    const interval = window.setInterval(() => void refreshActiveRun(), 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [apiConnected]);

  const statusPill = apiConnected
    ? hasActiveAutopilotRun
      ? {
          label: 'Autopilot Running',
          dotClassName: 'bg-emerald-500 animate-[pulse_2s_infinite]'
        }
      : {
          label: 'Backend Ready',
          dotClassName: 'bg-sky-500'
        }
    : {
        label: backendStatus,
        dotClassName: 'bg-muted-foreground'
      };

  const currentPageTitle =
    pageTitles[location.pathname] ??
    pageTitles[
    Object.keys(pageTitles).find((key) =>
      location.pathname.startsWith(key)
    ) ?? ''
    ] ??
    'JobAutomation';

  const handleLaunchAutopilot = async () => {
    toast.info('Review autopilot settings before launch.');
    navigate('/autopilot');
  };

  if (!apiConnected) {
    return <SaharaLoadingScreen />;
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
            'relative flex flex-col border-r border-sidebar-border bg-sidebar-background select-none overflow-hidden'
          )}
          aria-label="Main navigation"
        >
          {/* Brand */}
          <div className={cn(
            "flex items-center gap-3 py-5 border-b border-sidebar-border min-h-[72px]",
            sidebarCollapsed ? "justify-center px-0" : "px-4"
          )}>
            <SaharaLogo
              decorative={!sidebarCollapsed}
              className={cn(
                'shrink-0 rounded-xl object-contain',
                sidebarCollapsed ? 'h-10 w-10' : 'h-11 w-11'
              )}
            />
            {!sidebarCollapsed && (
              <div className="flex flex-col overflow-hidden">
                <span className="font-headline text-lg font-bold text-foreground tracking-tight truncate">
                  Sahara
                </span>
                <span className="text-xs text-muted-foreground font-semibold truncate">
                  Job Automation
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
                      const isActive = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);

                      return sidebarCollapsed ? (
                        <Tooltip key={item.to}>
                          <TooltipTrigger asChild>
                            <NavLink
                              to={item.to}
                              className={cn(
                                'flex items-center justify-center h-10 w-10 mx-auto rounded-lg transition-colors duration-200',
                                isActive
                                  ? 'bg-sidebar-accent text-sidebar-primary font-bold'
                                  : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground'
                              )}
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
                          className={cn(
                            'flex items-center gap-3 px-2 py-1.5 rounded-lg text-sm font-semibold transition-colors duration-200',
                            isActive
                              ? 'bg-sidebar-accent text-sidebar-primary font-bold'
                              : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground'
                          )}
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
              onClick={handleLaunchAutopilot}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
              <Rocket className={cn("shrink-0 z-10 relative", sidebarCollapsed ? "h-5 w-5" : "h-4 w-4")} />
              {!sidebarCollapsed && <span className="z-10 relative">Configure Autopilot</span>}
            </Button>

            {!sidebarCollapsed && (
              <div className="flex flex-col space-y-1 mt-2">
                <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground h-10 px-2 gap-3">
                  <div className="flex h-8 w-8 items-center justify-center shrink-0">
                    <HelpCircle className="h-5 w-5" />
                  </div>
                  Help
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start text-muted-foreground hover:bg-destructive hover:text-destructive-foreground h-10 px-2 gap-3"
                >
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
                "flex justify-center text-muted-foreground hover:text-foreground flex-shrink-0",
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
          {/* Top Header */}
          <header
            className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/90 backdrop-blur-md pl-6 pr-0"
            style={{ WebkitAppRegion: 'drag' } as any}
          >
            <h1 className="font-headline text-xl font-bold tracking-tight text-foreground">
              {currentPageTitle}
            </h1>

            <div className="flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as any}>
              <div className="flex items-center gap-3 mr-2">
                {/* System Status Pill */}
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-muted/40 text-xs font-semibold text-foreground">
                  <span className={cn('h-2 w-2 rounded-full', statusPill.dotClassName)} />
                  {statusPill.label}
                </div>

                {/* Notifications */}
                <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground" aria-label="Notifications">
                  <Bell className="h-4 w-4" />
                </Button>

                {/* Theme Toggle */}
                <ThemeToggle />
              </div>

              <WindowControls />
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
