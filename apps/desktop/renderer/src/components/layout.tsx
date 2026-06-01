import { useEffect, useState, useRef } from 'react';
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
  Loader2,
  Minus,
  Square,
  X
} from 'lucide-react';
import { toast } from 'sonner';

import { ApiConnectionGuard } from '@renderer/components/api-connection-guard';
import { CamoufoxSetupBanner } from '@renderer/components/camoufox-setup-banner';
import { useCamoufoxStatus } from '@renderer/lib/use-camoufox-status';
import { useTheme } from '@renderer/components/theme-provider';
import { createAutopilotRun } from '@renderer/lib/api';

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

const quirkyMessages = [
  "Reticulating splines...",
  "Warming up worker nodes...",
  "Feeding the hamsters...",
  "Polishing the pixels...",
  "Aligning the stars...",
  "Generating witty loading messages...",
  "Charging the flux capacitor...",
  "Summoning the AI spirits...",
  "Brewing coffee for the server...",
  "Untangling the web..."
];

function SaharaLoadingScreen() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [message] = useState(() => quirkyMessages[Math.floor(Math.random() * quirkyMessages.length)]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width: number, height: number, particles: any[] = [];
    let animationFrameId: number;

    function resize() {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    }

    class Particle {
      x!: number;
      y!: number;
      size!: number;
      speedX!: number;
      speedY!: number;
      opacity!: number;

      constructor() {
        this.init();
      }
      init() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.size = Math.random() * 2 + 1;
        this.speedX = Math.random() * 0.5 + 0.2;
        this.speedY = Math.random() * 0.2 - 0.1;
        this.opacity = Math.random() * 0.5 + 0.1;
      }
      update() {
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.x > width) this.x = -10;
        if (this.y > height) this.y = 0;
        if (this.y < 0) this.y = height;
      }
      draw() {
        ctx!.fillStyle = `rgba(255, 140, 0, ${this.opacity})`;
        ctx!.beginPath();
        ctx!.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx!.fill();
      }
    }

    function init() {
      resize();
      particles = Array.from({ length: 50 }, () => new Particle());
    }

    function animate() {
      ctx!.clearRect(0, 0, width, height);
      particles.forEach(p => {
        p.update();
        p.draw();
      });
      animationFrameId = requestAnimationFrame(animate);
    }

    window.addEventListener('resize', resize);
    init();
    animate();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="relative flex h-screen w-screen flex-col items-center justify-center bg-white text-zinc-900 overflow-hidden">
      <style>{`
        @keyframes loading-slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        .animate-loading-slide {
          animation: loading-slide 1.5s ease-in-out infinite;
        }
      `}</style>

      {/* Background Effects */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {/* Particle Canvas */}
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full"></canvas>
      </div>

      {/* Foreground Content */}
      <div className="z-10 flex flex-col items-center max-w-xs w-full px-6">
        {/* Logo */}
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground font-headline font-bold text-2xl mb-12 shadow-[0_0_20px_rgba(255,140,0,0.3)]">
          S
        </div>

        {/* Progress Container */}
        <div className="w-full flex flex-col items-center gap-4">
          {/* Quirky Message */}
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-500 animate-pulse text-center">
            {message}
          </p>

          {/* Indeterminate Progress Bar */}
          <div className="h-1 w-full bg-zinc-200 rounded-full overflow-hidden relative">
            <div className="absolute top-0 bottom-0 left-0 w-1/2 bg-gradient-to-r from-primary/10 via-primary to-primary/10 rounded-full animate-loading-slide" />
          </div>

          {/* Subtitle */}
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-400 mt-6">
            Sahara AI Automation
          </p>
        </div>
      </div>
    </div>
  );
}

export function DesktopLayout() {
  const [backendStatus, setBackendStatus] = useState('Connecting...');
  const [rawStatus, setRawStatus] = useState<string>('stopped');
  const { status: camoufoxStatus } = useCamoufoxStatus();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);

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

  const handleLaunchAutopilot = async () => {
    setIsLaunching(true);
    try {
      await createAutopilotRun();
      toast.success('Autopilot run started');
      navigate('/autopilot');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start autopilot.';
      toast.error(msg);
    } finally {
      setIsLaunching(false);
    }
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
              disabled={isLaunching}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
              {isLaunching ? (
                <Loader2 className={cn("shrink-0 z-10 relative animate-spin", sidebarCollapsed ? "h-5 w-5" : "h-4 w-4")} />
              ) : (
                <Rocket className={cn("shrink-0 z-10 relative", sidebarCollapsed ? "h-5 w-5" : "h-4 w-4")} />
              )}
              {!sidebarCollapsed && <span className="z-10 relative">{isLaunching ? 'Launching...' : 'Launch Autopilot'}</span>}
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
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-[pulse_2s_infinite]" />
                  System Active
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
