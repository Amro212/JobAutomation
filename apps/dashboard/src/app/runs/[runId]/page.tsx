import Link from 'next/link';
import { revalidatePath } from 'next/cache';

import type { LogEventRecord } from '@jobautomation/core';

import { getDiscoveryRun, retryDiscoveryRunStep } from '../../../lib/api';

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
  if (!log.detailsJson) {
    return null;
  }

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
    if (log.level !== 'error') {
      continue;
    }

    const details = parseDetails(log);
    const discoverySourceId = typeof details?.discoverySourceId === 'string' ? details.discoverySourceId : null;
    if (!discoverySourceId || seen.has(discoverySourceId)) {
      continue;
    }

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
  if (!details) {
    return 'No structured details';
  }

  const parts = [
    typeof details.label === 'string' ? details.label : null,
    typeof details.pageUrl === 'string' ? details.pageUrl : null,
    typeof details.extractorId === 'string' ? `extractor ${details.extractorId}` : null,
    typeof details.fallbackMode === 'string' ? `mode ${details.fallbackMode}` : null
  ].filter((value): value is string => value !== null);

  return parts.length > 0 ? parts.join(' • ') : 'Structured run metadata';
}

async function retrySourceAction(formData: FormData): Promise<void> {
  'use server';

  const runId = String(formData.get('runId') ?? '');
  const sourceId = String(formData.get('sourceId') ?? '');

  await retryDiscoveryRunStep(runId, {
    sourceId
  });

  revalidatePath('/runs');
  revalidatePath(`/runs/${runId}`);
}

export default async function RunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const detail = await getDiscoveryRun(runId);

  if (!detail) {
    return (
      <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-600 shadow-sm">
        Discovery run not found. Return to{' '}
        <Link href="/runs" className="font-medium text-slate-900 underline">
          runs
        </Link>
        .
      </section>
    );
  }

  const retryableSources = getRetryableSources(detail.logs);
  const artifacts = detail.artifacts as ArtifactSummary[];

  return (
    <section className="space-y-6">
      <div className="rounded-3xl bg-white p-8 shadow-sm">
        <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Run Detail</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">{detail.run.sourceKind} discovery run</h2>
        <dl className="mt-4 grid gap-4 text-sm text-slate-700 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">Status</dt>
            <dd className="mt-1 capitalize">{detail.run.status}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">Trigger</dt>
            <dd className="mt-1 capitalize">{detail.run.triggerKind}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">New Jobs</dt>
            <dd className="mt-1">{detail.run.newJobCount}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">Updated Jobs</dt>
            <dd className="mt-1">{detail.run.updatedJobCount}</dd>
          </div>
        </dl>
      </div>

      {retryableSources.length > 0 ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <p className="text-sm uppercase tracking-[0.24em] text-amber-700">Retry Failed Sources</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {retryableSources.map((source) => (
              <form key={source.discoverySourceId} action={retrySourceAction}>
                <input type="hidden" name="runId" value={runId} />
                <input type="hidden" name="sourceId" value={source.discoverySourceId} />
                <button className="rounded-full border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-900 transition hover:bg-amber-100">
                  Retry {source.sourceKind} {source.label}
                </button>
              </form>
            ))}
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Logs</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-900">Step visibility</h3>
        </div>
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Level</th>
              <th className="px-4 py-3 font-medium">Message</th>
              <th className="px-4 py-3 font-medium">Details</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {detail.logs.map((log) => (
              <tr key={log.id}>
                <td className="px-4 py-3 uppercase text-slate-600">{log.level}</td>
                <td className="px-4 py-3 text-slate-900">{log.message}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{renderLogDetails(log)}</td>
                <td className="px-4 py-3 text-slate-600">{log.createdAt.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Artifacts</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-900">Fallback evidence</h3>
        </div>
        {artifacts.length === 0 ? (
          <div className="px-6 py-5 text-sm text-slate-600">
            No fallback evidence was captured for this run.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Kind</th>
                <th className="px-4 py-3 font-medium">Format</th>
                <th className="px-4 py-3 font-medium">File</th>
                <th className="px-4 py-3 font-medium">Storage Path</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {artifacts.map((artifact) => (
                <tr key={artifact.id}>
                  <td className="px-4 py-3 text-slate-900">{artifact.kind}</td>
                  <td className="px-4 py-3 uppercase text-slate-600">{artifact.format}</td>
                  <td className="px-4 py-3 text-slate-900">{artifact.fileName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{artifact.storagePath}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
}
