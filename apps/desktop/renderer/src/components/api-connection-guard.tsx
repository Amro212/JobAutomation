import { useEffect, useState } from 'react';

import { getHealth } from '@renderer/lib/api';

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
        if (!active) {
          return;
        }

        setConnected(true);
        setTimedOut(false);
        setErrorMessage(null);
      } catch (error) {
        if (!active) {
          return;
        }

        setConnected(false);
        setTimedOut(Date.now() - startedAt >= HEALTH_FAILURE_TIMEOUT_MS);
        setErrorMessage(error instanceof Error ? error.message : 'Backend failed to start.');
      }
    };

    void poll();
    const intervalId = window.setInterval(() => {
      void poll();
    }, HEALTH_POLL_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  if (connected) {
    return null;
  }

  return (
    <div className="connection-overlay" role="status" aria-live="polite">
      <div className="connection-card">
        <div className="status-pill">Backend offline</div>
        <h2 className="text-xl font-semibold mb-2">
          {timedOut ? 'Backend failed to start' : 'Connecting to backend...'}
        </h2>
        <p className="text-sm text-muted-foreground mb-6 break-all">
          {timedOut
            ? `Error: ${errorMessage ?? 'Timeout'}`
            : 'The desktop shell is waiting for the local API to finish booting.'}
        </p>
        <div className="inline-actions">
          <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-white/5 h-10 px-4 py-2" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    </div>
  );
}
