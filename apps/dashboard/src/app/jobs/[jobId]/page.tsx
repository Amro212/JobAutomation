import Link from 'next/link';

import { getJob } from '../../../lib/api';

export default async function JobDetailPage({ params }: { params: Promise<{ jobId: string }> }): Promise<JSX.Element> {
  const { jobId } = await params;
  const job = await getJob(jobId);

  if (!job) {
    return <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-600 shadow-sm">Job not found. Return to <Link href="/jobs" className="font-medium text-slate-900 underline">jobs</Link>.</section>;
  }

  return (
    <section className="space-y-6 rounded-3xl bg-white p-8 shadow-sm">
      <div>
        <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Job Detail</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">{job.title}</h2>
        <p className="mt-2 text-sm text-slate-600">{job.companyName} ? {job.location || 'Unspecified'}</p>
      </div>
      <dl className="grid gap-4 md:grid-cols-2">
        <div><dt className="text-xs uppercase tracking-[0.18em] text-slate-500">Source</dt><dd className="mt-1 text-sm text-slate-900">{job.sourceKind}</dd></div>
        <div><dt className="text-xs uppercase tracking-[0.18em] text-slate-500">Status</dt><dd className="mt-1 text-sm capitalize text-slate-900">{job.status}</dd></div>
      </dl>
      <p className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">Artifact generation and application automation appear in later batches. This Batch A detail page exists to prove the dashboard reads persisted job state instead of static placeholders.</p>
    </section>
  );
}
