import Link from 'next/link';

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
import { getApplicationRuns } from '@/lib/api';

function statusVariant(status: string) {
  switch (status) {
    case 'completed':
      return 'success' as const;
    case 'failed':
      return 'destructive' as const;
    case 'running':
    case 'paused':
      return 'warning' as const;
    case 'skipped':
      return 'secondary' as const;
    default:
      return 'outline' as const;
  }
}

function statusSummary(status: string, stopReason: string | null): string {
  if (status === 'paused' && stopReason === 'manual_review_required') {
    return 'Paused before submit for manual review.';
  }

  switch (status) {
    case 'paused':
      return 'Run is paused.';
    case 'skipped':
      return 'Skipped before browser work started.';
    case 'running':
      return 'Automation is in progress.';
    case 'completed':
      return 'Application completed.';
    case 'failed':
      return 'Application failed.';
    default:
      return 'Queued for automation.';
  }
}

export default async function ApplicationsPage() {
  const runs = await getApplicationRuns();

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Applications
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-foreground">Application run history</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Run-level visibility stays explicit for manual review and skipped outcomes so operator
          state is always inspectable.
        </p>
      </div>

      {runs.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-8 text-sm text-muted-foreground shadow-sm">
          No application runs have been recorded yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Job</TableHead>
                <TableHead className="w-[120px]">Source</TableHead>
                <TableHead className="w-[240px]">Status</TableHead>
                <TableHead className="w-[180px]">Created</TableHead>
                <TableHead className="w-[180px]">Updated</TableHead>
                <TableHead className="w-[110px]">Inspect</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((entry) => (
                <TableRow key={entry.run.id}>
                  <TableCell className="align-top">
                    <div className="space-y-1">
                      <Link
                        href={`/applications/${entry.run.id}`}
                        className="block truncate font-medium hover:underline underline-offset-4"
                      >
                        {entry.job.title}
                      </Link>
                      <p className="truncate text-sm text-muted-foreground">
                        {entry.job.companyName} - {entry.job.location || 'Unspecified'}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="align-top capitalize">{entry.job.sourceKind}</TableCell>
                  <TableCell className="align-top">
                    <div className="space-y-1">
                      <Badge variant={statusVariant(entry.run.status)}>{entry.run.status}</Badge>
                      <p className="text-xs text-muted-foreground">
                        {statusSummary(entry.run.status, entry.run.stopReason)}
                      </p>
                      {entry.run.stopReason ? (
                        <p className="text-xs text-muted-foreground">
                          Stop reason: {entry.run.stopReason}
                        </p>
                      ) : null}
                      {entry.run.prefilterReasons.length > 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Prefilter: {entry.run.prefilterReasons.join(', ')}
                        </p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="align-top text-muted-foreground">
                    {entry.run.createdAt.toLocaleString()}
                  </TableCell>
                  <TableCell className="align-top text-muted-foreground">
                    {entry.run.updatedAt.toLocaleString()}
                  </TableCell>
                  <TableCell className="align-top">
                    <Button variant="link" size="sm" className="h-auto p-0" asChild>
                      <Link href={`/applications/${entry.run.id}`}>Open run</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
