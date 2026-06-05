import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useNavigate, useRouteError, isRouteErrorResponse } from 'react-router';

import { SaharaLogo } from '@renderer/components/sahara-logo';
import { AnimatedStatusIcon } from '@renderer/components/animated-status-icon';
import { Button } from '@/components/ui/button';
import { RefreshCw, Home } from 'lucide-react';

/* ──────────────────────────────────────────────────────────────
   Route-Level Error Boundary (used as `errorElement`)
   ────────────────────────────────────────────────────────────── */

function extractMessage(error: unknown): string {
  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      return 'The page you were looking for could not be found.';
    }
    return error.statusText || 'An unexpected navigation error occurred.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong while loading this page.';
}

function ErrorActions() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col sm:flex-row items-center gap-3 mt-8 w-full max-w-sm">
      <Button
        onClick={() => window.location.reload()}
        className="gap-2 w-full sm:w-auto"
        id="error-reload-btn"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Reload Page
      </Button>
      <Button
        variant="outline"
        onClick={() => navigate('/overview')}
        className="gap-2 w-full sm:w-auto"
        id="error-overview-btn"
      >
        <Home className="h-4 w-4" aria-hidden="true" />
        Go to Overview
      </Button>
    </div>
  );
}

/**
 * Used as `errorElement` on the React Router root route.
 * Catches routing errors and render errors that bubble up from child routes.
 */
export function RouteErrorBoundary() {
  const error = useRouteError();
  const message = extractMessage(error);
  const is404 = isRouteErrorResponse(error) && error.status === 404;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex h-screen w-screen items-center justify-center bg-background text-foreground p-6"
    >
      <div className="flex flex-col items-center text-center max-w-lg w-full">
        {/* Brand */}
        <SaharaLogo className="h-16 w-16 rounded-xl mb-8" />

        {/* Status icon */}
        <AnimatedStatusIcon variant={is404 ? 'blocked' : 'failed'} size={56} className="mb-6" />

        {/* Title */}
        <h1 className="font-headline text-2xl font-semibold tracking-tight text-foreground mb-2">
          {is404 ? 'Page Not Found' : 'Something Went Wrong'}
        </h1>

        {/* Message */}
        <p className="text-sm text-muted-foreground leading-relaxed max-w-[45ch]">
          {message}
        </p>

        {/* Actions */}
        <ErrorActions />

        {/* Subtle footer */}
        <p className="mt-10 text-xs text-muted-foreground/60">
          Sahara — Job Automation
        </p>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Class-Based Error Boundary (wraps the entire app tree)
   React still requires class components for `componentDidCatch`.
   ────────────────────────────────────────────────────────────── */

type FallbackProps = {
  error: Error;
  onReset: () => void;
};

function ClassBoundaryFallback({ error, onReset }: FallbackProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex h-screen w-screen items-center justify-center bg-background text-foreground p-6"
    >
      <div className="flex flex-col items-center text-center max-w-lg w-full">
        <SaharaLogo className="h-16 w-16 rounded-xl mb-8" />
        <AnimatedStatusIcon variant="failed" size={56} className="mb-6" />

        <h1 className="font-headline text-2xl font-semibold tracking-tight text-foreground mb-2">
          Something Went Wrong
        </h1>

        <p className="text-sm text-muted-foreground leading-relaxed max-w-[45ch]">
          {error.message || 'An unexpected error occurred in the application.'}
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3 mt-8 w-full max-w-sm">
          <Button
            onClick={onReset}
            className="gap-2 w-full sm:w-auto"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Reload Page
          </Button>
          <Button
            variant="outline"
            onClick={() => { window.location.hash = '#/overview'; window.location.reload(); }}
            className="gap-2 w-full sm:w-auto"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            Go to Overview
          </Button>
        </div>

        <p className="mt-10 text-xs text-muted-foreground/60">
          Sahara — Job Automation
        </p>
      </div>
    </div>
  );
}

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[AppErrorBoundary] Uncaught render error:', error, info.componentStack);
  }

  private handleReset = (): void => {
    this.setState({ error: null });
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <ClassBoundaryFallback
          error={this.state.error}
          onReset={this.handleReset}
        />
      );
    }

    return this.props.children;
  }
}
