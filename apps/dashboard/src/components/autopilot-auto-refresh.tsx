'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

type AutopilotSnapshot = {
  status: string;
  currentStep: string;
  discoveredJobCount: number;
  eligibleJobCount: number;
  submittedCount: number;
  blockedCount: number;
  failedCount: number;
};

function stepToast(step: string, snapshot: AutopilotSnapshot) {
  // Parse colon-separated context from steps like "generating_artifacts:Job Title"
  const [baseStep, context] = step.includes(':')
    ? [step.slice(0, step.indexOf(':')), step.slice(step.indexOf(':') + 1)]
    : [step, null];

  switch (baseStep) {
    case 'queued':
      toast('🚀 Autopilot queued', { description: 'Batch is queued and will start shortly.' });
      break;
    case 'discovery_running':
      toast('🔍 Discovery started', { description: 'Scanning sources for new job listings…' });
      break;
    case 'discovery_completed':
      toast.success('✅ Discovery finished', {
        description: `Found ${snapshot.discoveredJobCount} job${snapshot.discoveredJobCount === 1 ? '' : 's'} from enabled sources.`
      });
      break;
    case 'prefilter_running':
      toast('🧪 Prefilter running', { description: 'Matching jobs against your profile and preferences…' });
      break;
    case 'prefilter_completed':
      toast.success('✅ Prefilter complete', {
        description: `${snapshot.eligibleJobCount} eligible job${snapshot.eligibleJobCount === 1 ? '' : 's'} passed screening.`
      });
      break;
    case 'applications_running':
      toast('📝 Applications starting', {
        description: `Processing ${snapshot.eligibleJobCount} eligible job${snapshot.eligibleJobCount === 1 ? '' : 's'}…`
      });
      break;
    case 'generating_artifacts':
      toast('📄 Generating resume & cover letter', {
        description: context ? `Tailoring documents for ${context}` : 'Generating tailored documents…'
      });
      break;
    case 'submitting_application':
      toast('📨 Submitting application', {
        description: context ? `Applying to ${context}` : 'Submitting application…'
      });
      break;
    case 'applications_completed':
      toast.success('🎉 Batch complete', {
        description: [
          `${snapshot.submittedCount} submitted`,
          snapshot.blockedCount > 0 ? `${snapshot.blockedCount} blocked` : null,
          snapshot.failedCount > 0 ? `${snapshot.failedCount} failed` : null
        ]
          .filter(Boolean)
          .join(' · ')
      });
      break;
    case 'failed':
      toast.error('❌ Batch failed', { description: 'An error occurred during the autopilot run.' });
      break;
    case 'cancelled':
      toast('🛑 Autopilot stopped', { description: 'No further jobs will be processed.' });
      break;
  }
}

function toastCountChange(prev: AutopilotSnapshot, next: AutopilotSnapshot) {
  if (next.submittedCount > prev.submittedCount) {
    const delta = next.submittedCount - prev.submittedCount;
    toast.success(`✅ Application submitted`, {
      description: `${next.submittedCount} total submitted (${delta} new)`
    });
  }

  if (next.blockedCount > prev.blockedCount) {
    const delta = next.blockedCount - prev.blockedCount;
    toast(`⚠️ Application blocked`, {
      description: `${next.blockedCount} total blocked (${delta} new)`
    });
  }

  if (next.failedCount > prev.failedCount) {
    const delta = next.failedCount - prev.failedCount;
    toast.error(`❌ Application failed`, {
      description: `${next.failedCount} total failed (${delta} new)`
    });
  }
}

/**
 * Invisible client component that polls router.refresh() on an interval
 * while the autopilot page has active (pending/running) batches.
 *
 * Fires sonner toasts when the `currentStep` or outcome counts change
 * between polling cycles, providing real-time pipeline stage feedback.
 */
export function AutopilotAutoRefresh({
  hasActiveRun,
  currentStep,
  status,
  discoveredJobCount = 0,
  eligibleJobCount = 0,
  submittedCount = 0,
  blockedCount = 0,
  failedCount = 0,
  intervalMs = 3000
}: {
  hasActiveRun: boolean;
  currentStep?: string;
  status?: string;
  discoveredJobCount?: number;
  eligibleJobCount?: number;
  submittedCount?: number;
  blockedCount?: number;
  failedCount?: number;
  intervalMs?: number;
}) {
  const router = useRouter();
  const prevSnapshot = useRef<AutopilotSnapshot | null>(null);

  // Track step and count transitions
  useEffect(() => {
    if (!currentStep || !status) {
      // No active run data — reset tracking
      prevSnapshot.current = null;
      return;
    }

    const snapshot: AutopilotSnapshot = {
      status,
      currentStep,
      discoveredJobCount,
      eligibleJobCount,
      submittedCount,
      blockedCount,
      failedCount
    };

    const prev = prevSnapshot.current;

    if (!prev) {
      // First render with active data — don't spam toasts for existing state
      prevSnapshot.current = snapshot;
      return;
    }

    // Fire toast on step change
    if (prev.currentStep !== snapshot.currentStep) {
      stepToast(snapshot.currentStep, snapshot);
    }

    // Fire toasts on count increments (only when step didn't already produce a terminal toast)
    const isTerminalStep = ['applications_completed', 'failed', 'cancelled'].includes(
      snapshot.currentStep.split(':')[0]!
    );
    if (!isTerminalStep && prev.currentStep === snapshot.currentStep) {
      toastCountChange(prev, snapshot);
    }

    prevSnapshot.current = snapshot;
  }, [currentStep, status, discoveredJobCount, eligibleJobCount, submittedCount, blockedCount, failedCount]);

  // Polling
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
