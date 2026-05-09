import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AutopilotAutoRefresh } from '@/components/autopilot-auto-refresh';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  cancelAutopilotRun,
  createAutopilotRun,
  getApplicantProfile,
  getAutopilotRun,
  getAutopilotRuns,
  getDiscoverySources
} from '@/lib/api';

function statusVariant(status: string) {
  switch (status) {
    case 'completed':
      return 'success' as const;
    case 'partial':
      return 'warning' as const;
    case 'failed':
      return 'destructive' as const;
    case 'running':
      return 'warning' as const;
    case 'cancelled':
      return 'outline' as const;
    default:
      return 'outline' as const;
  }
}

function formatCount(label: string, count: number): string {
  return `${count} ${label}`;
}

function selectedRunIdFromSearchParams(
  value: string | string[] | undefined
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleString();
}

export default async function AutopilotPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;

  async function launchAutopilotAction(): Promise<void> {
    'use server';

    let result: Awaited<ReturnType<typeof createAutopilotRun>>;
    try {
      result = await createAutopilotRun();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to launch autopilot.';
      redirect(`/autopilot?error=${encodeURIComponent(message)}`);
    }

    revalidatePath('/autopilot');
    revalidatePath('/applications');
    revalidatePath('/submitted');
    redirect(
      `/autopilot?runId=${result.run.id}&message=${encodeURIComponent('Autopilot launched — discovery and applications will run automatically.')}`
    );
  }

  async function cancelAutopilotAction(): Promise<void> {
    'use server';

    const allRuns = await getAutopilotRuns();
    const activeRun = allRuns.find(
      (entry) => entry.run.status === 'running' || entry.run.status === 'pending'
    );

    if (!activeRun) {
      redirect(`/autopilot?error=${encodeURIComponent('No active autopilot run to cancel.')}`);
    }

    try {
      await cancelAutopilotRun(activeRun.run.id);
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

  const [profileState, sources, runs] = await Promise.all([
    getApplicantProfile(),
    getDiscoverySources(),
    getAutopilotRuns()
  ]);

  const enabledSources = sources.filter((source) => source.enabled);
  const selectedRunId =
    selectedRunIdFromSearchParams(resolvedSearchParams.runId) ?? runs[0]?.run.id;
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
                <Button type="submit" variant="destructive">
                  Stop autopilot
                </Button>
              </form>
            ) : null}
            <form action={launchAutopilotAction}>
              <Button type="submit" disabled={hasActiveRun}>
                Launch autopilot
              </Button>
            </form>
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
            <p className="mt-1 font-medium text-foreground">{enabledSources.length}</p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Batches
          </p>
          <h3 className="mt-2 text-xl font-semibold text-foreground">Latest autopilot runs</h3>
        </div>
        {runs.length === 0 ? (
          <div className="px-6 py-5 text-sm text-muted-foreground">
            No autopilot batches have been launched yet.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Status</TableHead>
                <TableHead>Counts</TableHead>
                <TableHead>Discovery</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>Inspect</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((entry) => (
                <TableRow key={entry.run.id}>
                  <TableCell>
                    <Badge variant={statusVariant(entry.run.status)}>{entry.run.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {[
                      formatCount('eligible', entry.run.eligibleJobCount),
                      formatCount('submitted', entry.run.submittedCount),
                      formatCount('blocked', entry.run.blockedCount)
                    ].join(' · ')}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {entry.discoveryRun ? (
                      <Link
                        href={`/runs/${entry.discoveryRun.id}`}
                        className="hover:underline underline-offset-4"
                      >
                        Open discovery run
                      </Link>
                    ) : (
                      'Pending'
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(entry.run.updatedAt)}
                  </TableCell>
                  <TableCell>
                    <Button variant="link" size="sm" className="h-auto p-0" asChild>
                      <Link href={`/autopilot?runId=${entry.run.id}`}>Open batch</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {selectedRun ? (
        <section className="space-y-6 rounded-xl border bg-card p-6 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Batch Detail
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h3 className="text-xl font-semibold text-foreground">Autopilot batch</h3>
              <Badge variant={statusVariant(selectedRun.run.status)}>{selectedRun.run.status}</Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Current step: {selectedRun.run.currentStep}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-lg border bg-muted/50 px-4 py-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Discovered
              </p>
              <p className="mt-1 font-medium">{selectedRun.run.discoveredJobCount}</p>
            </div>
            <div className="rounded-lg border bg-muted/50 px-4 py-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Eligible
              </p>
              <p className="mt-1 font-medium">{selectedRun.run.eligibleJobCount}</p>
            </div>
            <div className="rounded-lg border bg-muted/50 px-4 py-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Skipped
              </p>
              <p className="mt-1 font-medium">{selectedRun.run.skippedJobCount}</p>
            </div>
            <div className="rounded-lg border bg-muted/50 px-4 py-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Submitted
              </p>
              <p className="mt-1 font-medium">{selectedRun.run.submittedCount}</p>
            </div>
            <div className="rounded-lg border bg-muted/50 px-4 py-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Blocked
              </p>
              <p className="mt-1 font-medium">{selectedRun.run.blockedCount}</p>
            </div>
            <div className="rounded-lg border bg-muted/50 px-4 py-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Failed
              </p>
              <p className="mt-1 font-medium">{selectedRun.run.failedCount}</p>
            </div>
          </div>

          {selectedRun.run.errorMessage ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {selectedRun.run.errorMessage}
            </p>
          ) : null}

          <div className="overflow-hidden rounded-xl border">
            <div className="border-b px-6 py-4">
              <h4 className="text-lg font-semibold text-foreground">Child application runs</h4>
            </div>
            {selectedRun.applications.length === 0 ? (
              <div className="px-6 py-5 text-sm text-muted-foreground">
                No child application runs have been recorded for this batch yet.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Job</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Artifacts</TableHead>
                    <TableHead>Inspect</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedRun.applications.map((entry) => (
                    <TableRow key={entry.run.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">{entry.job.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {entry.job.companyName} · {entry.job.location || 'Unspecified'}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(entry.run.status)}>{entry.run.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {[
                          entry.resumeArtifact ? 'Resume' : null,
                          entry.coverLetterArtifact ? 'Cover letter' : null
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'None linked'}
                      </TableCell>
                      <TableCell>
                        <Button variant="link" size="sm" className="h-auto p-0" asChild>
                          <Link href={`/applications/${entry.run.id}`}>Open run</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </section>
      ) : null}
    </section>
  );
}
