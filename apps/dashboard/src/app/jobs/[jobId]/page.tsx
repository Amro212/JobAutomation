import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { JobReviewPanel } from '@/components/jobs/job-review-panel';
import {
  addJobToShortlist,
  getJob,
  getJobReviewCapabilities,
  removeJobFromShortlist,
  scoreJobReview,
  updateJobReview
} from '@/lib/api';

function buildJobDetailHref(jobId: string, values: Record<string, string>): string {
  const searchParams = new URLSearchParams(values);
  const query = searchParams.toString();
  return query.length > 0 ? `/jobs/${jobId}?${query}` : `/jobs/${jobId}`;
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { jobId } = await params;
  const [job, capabilities] = await Promise.all([
    getJob(jobId),
    getJobReviewCapabilities()
  ]);

  if (!job) {
    return (
      <section className="rounded-xl border border-dashed bg-card p-8 text-sm text-muted-foreground shadow-sm">
        Job not found. Return to{' '}
        <Button variant="link" className="h-auto p-0" asChild>
          <Link href="/jobs">jobs</Link>
        </Button>
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
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Job Detail
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">{job.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {job.companyName} - {job.location || 'Unspecified'}
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/jobs/${jobId}/artifacts`}>View artifacts</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={job.sourceUrl} target="_blank" rel="noreferrer">
                Open source posting
              </a>
            </Button>
          </div>
        </div>
        <dl className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Source
            </dt>
            <dd className="mt-1 text-sm capitalize">{job.sourceKind}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Status
            </dt>
            <dd className="mt-1">
              <Badge
                variant={
                  job.status === 'shortlisted'
                    ? 'success'
                    : job.status === 'reviewing'
                      ? 'warning'
                      : 'secondary'
                }
                className="capitalize"
              >
                {job.status}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Remote
            </dt>
            <dd className="mt-1 text-sm capitalize">{job.remoteType}</dd>
          </div>
        </dl>
        <div className="mt-6 whitespace-pre-wrap rounded-lg bg-muted/50 p-4 text-sm leading-6 text-muted-foreground">
          {job.descriptionText || 'No description text was captured for this job.'}
        </div>
      </div>

      <JobReviewPanel
        job={job}
        scoringEnabled={capabilities.scoringEnabled}
        saveReviewAction={saveReviewAction}
        addToShortlistAction={addToShortlistAction}
        removeFromShortlistAction={removeFromShortlistAction}
        scoreAction={scoreAction}
      />

      <div>
        <Button variant="link" className="h-auto p-0" asChild>
          <Link href="/jobs">Return to jobs</Link>
        </Button>
      </div>
    </section>
  );
}
