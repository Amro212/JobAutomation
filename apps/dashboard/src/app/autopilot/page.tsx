import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { saveAutopilotSettingsAction, launchAutopilotAction } from './actions';
import { AutopilotBatchesPanel } from '@/components/autopilot/autopilot-batches-panel';
import { AutopilotSettingsCard } from '@/components/autopilot/autopilot-settings-card';
import { AutopilotAutoRefresh } from '@/components/autopilot-auto-refresh';
import { SubmitButton } from '@/components/submit-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  cancelAutopilotRun,
  getApplicantProfile,
  getAutopilotSettings,
  getAutopilotRun,
  getAutopilotRuns,
  getDiscoverySources
} from '@/lib/api';

function selectedRunIdFromSearchParams(
  value: string | string[] | undefined
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AutopilotPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;

  async function cancelAutopilotAction(formData: FormData): Promise<void> {
    'use server';

    const selectedRunId = String(formData.get('runId') ?? '');

    if (!selectedRunId) {
      redirect(`/autopilot?error=${encodeURIComponent('No active autopilot run to cancel.')}`);
    }

    try {
      await cancelAutopilotRun(selectedRunId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to stop autopilot.';
      redirect(`/autopilot?error=${encodeURIComponent(message)}`);
    }

    revalidatePath('/autopilot');
    revalidatePath('/applications');
    redirect(
      `/autopilot?message=${encodeURIComponent('Autopilot stopped — no further jobs will be processed.')}`
    );
  }

  const [profileState, sources, runs, autopilotSettings] = await Promise.all([
    getApplicantProfile(),
    getDiscoverySources(),
    getAutopilotRuns(),
    getAutopilotSettings()
  ]);

  const enabledSources = sources.filter((source) => source.enabled);
  const selectedSources =
    autopilotSettings.config.discoverySourceIds.length === 0
      ? enabledSources
      : enabledSources.filter((source) =>
          autopilotSettings.config.discoverySourceIds.includes(source.id)
        );
  const selectedRunId = selectedRunIdFromSearchParams(resolvedSearchParams.runId);
  const selectedRun = selectedRunId ? await getAutopilotRun(selectedRunId) : null;

  const activeRunEntry = runs.find(
    (entry) => entry.run.status === 'running' || entry.run.status === 'pending'
  );
  const hasActiveRun = Boolean(activeRunEntry);

  return (
    <section className="space-y-6">
      <AutopilotAutoRefresh
        hasActiveRun={hasActiveRun}
        currentStep={activeRunEntry?.run.currentStep}
        status={activeRunEntry?.run.status}
        discoveredJobCount={activeRunEntry?.run.discoveredJobCount}
        eligibleJobCount={activeRunEntry?.run.eligibleJobCount}
        submittedCount={activeRunEntry?.run.submittedCount}
        blockedCount={activeRunEntry?.run.blockedCount}
        failedCount={activeRunEntry?.run.failedCount}
      />

      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Autopilot
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-foreground">Batch launch and monitoring</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Launch a sequential discovery-plus-apply batch, then inspect eligible, skipped,
          submitted, and blocked outcomes per run.
        </p>
      </div>

      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Readiness
            </p>
            <h3 className="mt-2 text-xl font-semibold text-foreground">Launch checks</h3>
          </div>
          <div className="flex items-center gap-2">
            {hasActiveRun ? (
              <form action={cancelAutopilotAction}>
                <input type="hidden" name="runId" value={activeRunEntry!.run.id} />
                <SubmitButton variant="destructive" pendingText="Stopping...">
                  Stop autopilot
                </SubmitButton>
              </form>
            ) : null}
            <Button variant="outline" asChild>
              <Link href="#autopilot-settings">Edit launch settings</Link>
            </Button>
          </div>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border bg-muted/50 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Base resume
            </p>
            <p className="mt-1">
              <Badge variant={profileState.readiness.hasBaseResume ? 'success' : 'destructive'}>
                {profileState.readiness.hasBaseResume ? 'Stored' : 'Missing'}
              </Badge>
            </p>
          </div>
          <div className="rounded-lg border bg-muted/50 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Applicant context
            </p>
            <p className="mt-1">
              <Badge
                variant={profileState.readiness.hasReusableContext ? 'success' : 'destructive'}
              >
                {profileState.readiness.hasReusableContext ? 'Stored' : 'Missing'}
              </Badge>
            </p>
          </div>
          <div className="rounded-lg border bg-muted/50 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Enabled sources
            </p>
            <p className="mt-1 font-medium text-foreground">
              {selectedSources.length} / {enabledSources.length}
            </p>
          </div>
        </div>
      </section>

      <div id="autopilot-settings">
        <AutopilotSettingsCard
          enabledSources={enabledSources}
          settings={autopilotSettings}
          hasActiveRun={hasActiveRun}
          preferredCountriesFallback={profileState.profile?.preferredCountries ?? []}
          saveAction={saveAutopilotSettingsAction}
          launchAction={launchAutopilotAction}
        />
      </div>

      <AutopilotBatchesPanel runs={runs} selectedRun={selectedRun} />
    </section>
  );
}
