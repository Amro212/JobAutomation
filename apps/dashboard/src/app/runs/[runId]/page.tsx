import Link from 'next/link';
import { revalidatePath } from 'next/cache';

import type { LogEventRecord } from '@jobautomation/core';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SubmitButton } from '@/components/submit-button';
import { getDiscoveryRun, retryDiscoveryRunStep } from '@/lib/api';

type RetryableSource = {
  discoverySourceId: string;
  label: string;
  sourceKind: string;
};

type ArtifactSummary = {
  id: string;
  kind: string;
  format: string;
  fileName: string;
  storagePath: string;
};

function parseDetails(log: LogEventRecord): Record<string, unknown> | null {
  if (!log.detailsJson) return null;
  try {
    return JSON.parse(log.detailsJson) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getRetryableSources(logs: LogEventRecord[]): RetryableSource[] {
  const seen = new Set<string>();
  const retryable: RetryableSource[] = [];

  for (const log of logs) {
    if (log.level !== 'error') continue;

    const details = parseDetails(log);
    const discoverySourceId = typeof details?.discoverySourceId === 'string' ? details.discoverySourceId : null;
    if (!discoverySourceId || seen.has(discoverySourceId)) continue;

    retryable.push({
      discoverySourceId,
      label: typeof details?.label === 'string' ? details.label : discoverySourceId,
      sourceKind: typeof details?.sourceKind === 'string' ? details.sourceKind : 'source'
    });
    seen.add(discoverySourceId);
  }

  return retryable;
}

function renderLogDetails(log: LogEventRecord): string {
  const details = parseDetails(log);
  if (!details) return 'No structured details';

  const parts = [
    typeof details.label === 'string' ? details.label : null,
    typeof details.pageUrl === 'string' ? details.pageUrl : null,
    typeof details.extractorId === 'string' ? `extractor ${details.extractorId}` : null,
    typeof details.fallbackMode === 'string' ? `mode ${details.fallbackMode}` : null
  ].filter((value): value is string => value !== null);

  return parts.length > 0 ? parts.join(' \u2022 ') : 'Structured run metadata';
}

function logLevelVariant(level: string) {
  switch (level) {
    case 'error':
      return 'destructive' as const;
    case 'warn':
      return 'warning' as const;
    default:
      return 'secondary' as const;
  }
}

async function retrySourceAction(formData: FormData): Promise<void> {
  'use server';

  const runId = String(formData.get('runId') ?? '');
  const sourceId = String(formData.get('sourceId') ?? '');

  await retryDiscoveryRunStep(runId, { sourceId });

  revalidatePath('/runs');
  revalidatePath(`/runs/${runId}`);
}

export default async function RunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const detail = await getDiscoveryRun(runId);

  if (!detail) {
    return (
      <section className="rounded-xl border border-dashed bg-card p-8 text-sm text-muted-foreground shadow-sm">
        Discovery run not found. Return to{' '}
        <Button variant="link" className="h-auto p-0" asChild>
          <Link href="/runs">runs</Link>
        </Button>
        .
      </section>
    );
  }

  const retryableSources = getRetryableSources(detail.logs);
  const artifacts = detail.artifacts as ArtifactSummary[];

  return (
    <section className="space-y-6">
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Run Detail
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-foreground">
          {detail.run.sourceKind} discovery run
        </h2>
        <dl className="mt-4 grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-4">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Status
            </dt>
            <dd className="mt-1">
              <Badge
                variant={
                  detail.run.status === 'completed'
                    ? 'success'
                    : detail.run.status === 'failed'
                      ? 'destructive'
                      : 'warning'
                }
                className="capitalize"
              >
                {detail.run.status}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Trigger
            </dt>
            <dd className="mt-1 capitalize">{detail.run.triggerKind}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              New Jobs
            </dt>
            <dd className="mt-1">{detail.run.newJobCount}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Updated Jobs
            </dt>
            <dd className="mt-1">{detail.run.updatedJobCount}</dd>
          </div>
        </dl>
      </div>

      {retryableSources.length > 0 ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">
            Retry Failed Sources
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {retryableSources.map((source) => (
              <form key={source.discoverySourceId} action={retrySourceAction}>
                <input type="hidden" name="runId" value={runId} />
                <input type="hidden" name="sourceId" value={source.discoverySourceId} />
                <SubmitButton variant="warning" pendingText="Retrying...">
                  Retry {source.sourceKind} {source.label}
                </SubmitButton>
              </form>
            ))}
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Logs
          </p>
          <h3 className="mt-2 text-xl font-semibold text-foreground">Step visibility</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Level</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>Details</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell>
                  <Badge variant={logLevelVariant(log.level)} className="uppercase">
                    {log.level}
                  </Badge>
                </TableCell>
                <TableCell>{log.message}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {renderLogDetails(log)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {log.createdAt.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Artifacts
          </p>
          <h3 className="mt-2 text-xl font-semibold text-foreground">Fallback evidence</h3>
        </div>
        {artifacts.length === 0 ? (
          <div className="px-6 py-5 text-sm text-muted-foreground">
            No fallback evidence was captured for this run.
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
              {artifacts.map((artifact) => (
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
    </section>
  );
}
