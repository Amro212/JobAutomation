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
import { getApplicationRun } from '@/lib/api';

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
    return 'Paused at final review and waiting for a human to submit.';
  }

  switch (status) {
    case 'paused':
      return 'Automation is paused.';
    case 'skipped':
      return 'Skipped before browser automation started.';
    case 'running':
      return 'Automation is still in progress.';
    case 'completed':
      return 'Automation completed successfully.';
    case 'failed':
      return 'Automation failed before completion.';
    default:
      return 'Queued for automation.';
  }
}

export default async function ApplicationRunDetailPage({
  params
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const detail = await getApplicationRun(runId);

  if (!detail) {
    return (
      <section className="rounded-xl border border-dashed bg-card p-8 text-sm text-muted-foreground shadow-sm">
        Application run not found. Return to{' '}
        <Button variant="link" className="h-auto p-0" asChild>
          <Link href="/applications">applications</Link>
        </Button>
        .
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Application Run
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-foreground">{detail.job.title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {detail.job.companyName} - {detail.job.location || 'Unspecified'}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/jobs/${detail.job.id}`}>View job</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={detail.job.sourceUrl} target="_blank" rel="noreferrer">
              Open source posting
            </a>
          </Button>
        </div>

        <dl className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Status
            </dt>
            <dd className="mt-1">
              <Badge variant={statusVariant(detail.run.status)}>{detail.run.status}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Source
            </dt>
            <dd className="mt-1 capitalize">{detail.job.sourceKind}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Created
            </dt>
            <dd className="mt-1 text-sm text-muted-foreground">
              {detail.run.createdAt.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Updated
            </dt>
            <dd className="mt-1 text-sm text-muted-foreground">
              {detail.run.updatedAt.toLocaleString()}
            </dd>
          </div>
        </dl>
      </div>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">
          Run State
        </p>
        <h3 className="mt-2 text-xl font-semibold text-foreground">
          {statusSummary(detail.run.status, detail.run.stopReason)}
        </h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This read model stays explicit about skipped and manual review required outcomes so the
          operator never has to infer whether browser automation ran.
        </p>
        {detail.run.stopReason ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Stop reason: {detail.run.stopReason}
          </p>
        ) : null}
        {detail.run.prefilterReasons.length > 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Prefilter reasons: {detail.run.prefilterReasons.join(', ')}
          </p>
        ) : null}
        {detail.run.reviewUrl ? (
          <div className="mt-3">
            <Button variant="link" className="h-auto p-0" asChild>
              <a href={detail.run.reviewUrl} target="_blank" rel="noreferrer">
                Open final review URL
              </a>
            </Button>
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Logs
          </p>
          <h3 className="mt-2 text-xl font-semibold text-foreground">Step visibility</h3>
        </div>
        {detail.logs.length === 0 ? (
          <div className="px-6 py-5 text-sm text-muted-foreground">
            No application step logs were captured for this run.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Level</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="uppercase">{log.level}</TableCell>
                  <TableCell>{log.message}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {log.createdAt.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Evidence
          </p>
          <h3 className="mt-2 text-xl font-semibold text-foreground">Run-scoped artifacts</h3>
        </div>
        {detail.artifacts.length === 0 ? (
          <div className="px-6 py-5 text-sm text-muted-foreground">
            No run-scoped evidence artifacts have been captured for this run yet.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Kind</TableHead>
                <TableHead>Format</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Storage Path</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.artifacts.map((artifact) => (
                <TableRow key={artifact.id}>
                  <TableCell>{artifact.kind}</TableCell>
                  <TableCell className="uppercase text-muted-foreground">{artifact.format}</TableCell>
                  <TableCell>{artifact.fileName}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {artifact.storagePath}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <div>
        <Button variant="link" className="h-auto p-0" asChild>
          <Link href="/applications">Return to applications</Link>
        </Button>
      </div>
    </section>
  );
}
