import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { JobReviewPanel } from '../../../components/jobs/job-review-panel';
import {
  addJobToShortlist,
  getJob,
  getJobReviewCapabilities,
  removeJobFromShortlist,
  scoreJobReview,
  updateJobReview
} from '../../../lib/api';

function getSearchParamValue(
  value: string | string[] | undefined
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function buildJobDetailHref(jobId: string, values: Record<string, string>): string {
  const searchParams = new URLSearchParams(values);
  const query = searchParams.toString();
  return query.length > 0 ? `/jobs/${jobId}?${query}` : `/jobs/${jobId}`;
}

export default async function JobDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { jobId } = await params;
  const resolvedSearchParams = await searchParams;
  const [job, capabilities] = await Promise.all([
    getJob(jobId),
    getJobReviewCapabilities()
  ]);
  const flashMessage = getSearchParamValue(resolvedSearchParams.message);
  const flashError = getSearchParamValue(resolvedSearchParams.error);

  if (!job) {
    return (
      <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-600 shadow-sm">
        Job not found. Return to{' '}
        <Link href="/jobs" className="font-medium text-slate-900 underline">
          jobs
        </Link>
        .
      </section>
    );
  }

  async function saveReviewAction(formData: FormData): Promise<void> {
    'use server';

    try {
      await updateJobReview(jobId, {
        status: String(formData.get('status') ?? '') as
          | 'discovered'
          | 'reviewing'
          | 'shortlisted'
          | 'archived',
        reviewNotes: String(formData.get('reviewNotes') ?? '')
      });
      revalidatePath('/jobs');
      revalidatePath('/shortlist');
      revalidatePath(`/jobs/${jobId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save review.';
      redirect(buildJobDetailHref(jobId, { error: message }));
    }

    redirect(buildJobDetailHref(jobId, { message: 'Review saved.' }));
  }

  async function addToShortlistAction(): Promise<void> {
    'use server';

    try {
      await addJobToShortlist(jobId);
      revalidatePath('/jobs');
      revalidatePath('/shortlist');
      revalidatePath(`/jobs/${jobId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to shortlist job.';
      redirect(buildJobDetailHref(jobId, { error: message }));
    }

    redirect(buildJobDetailHref(jobId, { message: 'Job shortlisted.' }));
  }

  async function removeFromShortlistAction(): Promise<void> {
    'use server';

    try {
      await removeJobFromShortlist(jobId);
      revalidatePath('/jobs');
      revalidatePath('/shortlist');
      revalidatePath(`/jobs/${jobId}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to remove job from shortlist.';
      redirect(buildJobDetailHref(jobId, { error: message }));
    }

    redirect(buildJobDetailHref(jobId, { message: 'Job moved back to reviewing.' }));
  }

  async function scoreAction(): Promise<void> {
    'use server';

    try {
      await scoreJobReview(jobId);
      revalidatePath(`/jobs/${jobId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to score job.';
      redirect(buildJobDetailHref(jobId, { error: message }));
    }

    redirect(buildJobDetailHref(jobId, { message: 'Summary and score updated.' }));
  }

  return (
    <section className="space-y-6">
      <div className="rounded-3xl bg-white p-8 shadow-sm">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Job Detail</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">{job.title}</h2>
          <p className="mt-2 text-sm text-slate-600">
            {job.companyName} - {job.location || 'Unspecified'}
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link
              href={`/jobs/${jobId}/artifacts`}
              className="rounded-full border border-slate-200 px-4 py-2 font-medium text-slate-700 underline-offset-2 hover:border-slate-300 hover:text-slate-900 hover:underline"
            >
              View artifacts
            </Link>
            <a
              href={job.sourceUrl}
              className="rounded-full border border-slate-200 px-4 py-2 font-medium text-slate-700 underline-offset-2 hover:border-slate-300 hover:text-slate-900 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Open source posting
            </a>
          </div>
        </div>
        <dl className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">Source</dt>
            <dd className="mt-1 text-sm capitalize text-slate-900">{job.sourceKind}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">Status</dt>
            <dd className="mt-1 text-sm capitalize text-slate-900">{job.status}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">Remote</dt>
            <dd className="mt-1 text-sm capitalize text-slate-900">{job.remoteType}</dd>
          </div>
        </dl>
        <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
          {job.descriptionText || 'No description text was captured for this job.'}
        </div>
      </div>

      <JobReviewPanel
        job={job}
        scoringEnabled={capabilities.scoringEnabled}
        flashMessage={flashMessage}
        flashError={flashError}
        saveReviewAction={saveReviewAction}
        addToShortlistAction={addToShortlistAction}
        removeFromShortlistAction={removeFromShortlistAction}
        scoreAction={scoreAction}
      />

      <div>
        <Link href="/jobs" className="text-sm font-medium text-slate-700 underline">
          Return to jobs
        </Link>
      </div>
    </section>
  );
}
