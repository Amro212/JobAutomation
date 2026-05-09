'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Invisible client component that polls router.refresh() on an interval
 * while the autopilot page has active (pending/running) batches.
 */
export function AutopilotAutoRefresh({
  hasActiveRun,
  intervalMs = 3000
}: {
  hasActiveRun: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!hasActiveRun) {
      return;
    }

    const id = setInterval(() => {
      router.refresh();
    }, intervalMs);

    return () => clearInterval(id);
  }, [hasActiveRun, intervalMs, router]);

  return null;
}
