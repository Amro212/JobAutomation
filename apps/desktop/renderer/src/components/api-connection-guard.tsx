import { useEffect, useState } from 'react';
import { AlertCircle, RefreshCw, Loader2 } from 'lucide-react';

import { getHealth } from '@renderer/lib/api';
import { Button } from '@/components/ui/button';
import { cn } from '@renderer/lib/utils';

const HEALTH_POLL_INTERVAL_MS = 2_000;
const HEALTH_FAILURE_TIMEOUT_MS = 30_000;

export function ApiConnectionGuard() {
  const [connected, setConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    let active = true;
    const startedAt = Date.now();

    const poll = async () => {
      try {
        await getHealth();
        if (!active) return;
        setConnected(true);
        setTimedOut(false);
        setErrorMessage(null);
      } catch (error) {
        if (!active) return;
        setConnected(false);
        setTimedOut(Date.now() - startedAt >= HEALTH_FAILURE_TIMEOUT_MS);
        setErrorMessage(error instanceof Error ? error.message : 'Backend failed to start.');
      }
    };

    void poll();
    const intervalId = window.setInterval(() => void poll(), HEALTH_POLL_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  if (connected) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={!timedOut}
      className={cn(
        'flex items-start gap-3 rounded-lg border px-4 py-3 text-sm',
        timedOut
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : 'border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-400'
      )}
    >
      {timedOut ? (
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
      ) : (
        <Loader2 className="h-4 w-4 mt-0.5 shrink-0 animate-spin" />
      )}
      <div className="flex-1 min-w-0">
        <p className="font-semibold">
          {timedOut ? 'Backend failed to start' : 'Connecting to backend…'}
        </p>
        <p className="text-xs mt-0.5 opacity-80">
          {timedOut
            ? `Error: ${errorMessage ?? 'Timeout'}`
            : 'Waiting for the local Fastify API to finish booting.'}
        </p>
      </div>
      {timedOut && (
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={() => window.location.reload()}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Retry
        </Button>
      )}
    </div>
  );
}
