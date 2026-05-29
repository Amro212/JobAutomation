import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { JobReviewPanel } from '@/components/jobs/job-review-panel';
import {
  addJobToShortlist,
  createApplicationRun,
  getJob,
  getJobArtifacts,
  getJobReviewCapabilities,
  removeJobFromShortlist,
  scoreJobReview,
  updateJobReview,
} from '@/lib/api';

type MatchAudit = {
  decision?: string;
  score?: number;
  reasons?: string[];
  signals?: string[];
  roleFamily?: { name?: string; matched?: boolean };
  evidence?: {
    matchedKeywords?: string[];
    matchedSkills?: string[];
    missingMustHaveKeywords?: string[];
  };
  seniority?: {
    profile?: string | null;
    earlyCareerSignal?: boolean;
    minYearsRequired?: number | null;
    softExperienceCap?: boolean;
  };
  llm?: {
    reviewed?: boolean;
    pass?: boolean | null;
    rationale?: string | null;
    reasonCodes?: string[];
  };
};

function parseMatchAudit(raw: string | null): MatchAudit | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return { signals: parsed.filter((value): value is string => typeof value === 'string') };
    }
    if (parsed && typeof parsed === 'object') {
      return parsed as MatchAudit;
    }
  } catch {
    return null;
  }
  return null;
}

function parseStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    return [];
  }
}

function matchDecision(
  prefilterPass: boolean | null,
  audit: MatchAudit | null
): 'pass' | 'reject' | 'unknown' {
  if (prefilterPass != null) {
    return prefilterPass ? 'pass' : 'reject';
  }

  return audit?.decision === 'pass' || audit?.decision === 'reject'
    ? audit.decision
    : 'unknown';
}

function buildJobDetailHref(
  jobId: string,
  values: Record<string, string>
): string {
  const searchParams = new URLSearchParams(values);
  const query = searchParams.toString();
  return query.length > 0 ? `/jobs/${jobId}?${query}` : `/jobs/${jobId}`;
}

function hasGeneratedResumePdfArtifact(
  artifacts: Array<{ kind: string; format: string }>
): boolean {
  return artifacts.some(
    (artifact) => artifact.format === 'pdf' && artifact.kind === 'resume-variant'
  );
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
    getJobReviewCapabilities(),
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

  const artifacts = await getJobArtifacts(jobId);
  const matchAudit = parseMatchAudit(job.prefilterSignalsJson);
  const prefilterReasons = parseStringArray(job.prefilterReasonsJson);
  const auditReasons = matchAudit?.reasons ?? [];
  const displayReasons = prefilterReasons.length > 0 ? prefilterReasons : auditReasons;
  const decision = matchDecision(job.prefilterPass, matchAudit);

  async function saveReviewAction(formData: FormData): Promise<void> {
    'use server';

    try {
      await updateJobReview(jobId, {
        status: String(formData.get('status') ?? '') as
          | 'discovered'
          | 'reviewing'
          | 'shortlisted'
          | 'applied'
          | 'archived',
        reviewNotes: String(formData.get('reviewNotes') ?? ''),
      });
      revalidatePath('/jobs');
      revalidatePath('/shortlist');
      revalidatePath(`/jobs/${jobId}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to save review.';
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
      const message =
        error instanceof Error ? error.message : 'Failed to shortlist job.';
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
        error instanceof Error
          ? error.message
          : 'Failed to remove job from shortlist.';
      redirect(buildJobDetailHref(jobId, { error: message }));
    }

    redirect(
      buildJobDetailHref(jobId, { message: 'Job moved back to reviewing.' })
    );
  }

  async function scoreAction(): Promise<void> {
    'use server';

    try {
      await scoreJobReview(jobId);
      revalidatePath(`/jobs/${jobId}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to score job.';
      redirect(buildJobDetailHref(jobId, { error: message }));
    }

    redirect(
      buildJobDetailHref(jobId, { message: 'Summary and score updated.' })
    );
  }

  async function startApplicationRunAction(): Promise<void> {
    'use server';

    const currentArtifacts = await getJobArtifacts(jobId);
    if (!hasGeneratedResumePdfArtifact(currentArtifacts)) {
      redirect(
        buildJobDetailHref(jobId, {
          error:
            'Generate tailored artifacts before starting an application run.',
        })
      );
    }

    let runId: string;
    try {
      const result = await createApplicationRun({ jobId });
      runId = result.run.id;
      revalidatePath('/applications');
      revalidatePath(`/applications/${runId}`);
      revalidatePath(`/jobs/${jobId}`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to start the application run.';
      redirect(buildJobDetailHref(jobId, { error: message }));
    }

    redirect(`/applications/${runId}`);
  }

  const canStartApplicationRun = hasGeneratedResumePdfArtifact(artifacts);

  return (
    <section className="space-y-6">
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Job Detail
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">
            {job.title}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {job.companyName} - {job.location || 'Unspecified'}
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/jobs/${jobId}/artifacts`}>View artifacts</Link>
            </Button>
            <form action={startApplicationRunAction}>
              <Button
                variant="default"
                size="sm"
                type="submit"
                disabled={!canStartApplicationRun}
                title={
                  canStartApplicationRun
                    ? undefined
                    : 'Generate tailored artifacts before starting an application run.'
                }
              >
                Start application run
              </Button>
            </form>
            <Button variant="outline" size="sm" asChild>
              <a href={job.sourceUrl} target="_blank" rel="noreferrer">
                Open source posting
              </a>
            </Button>
          </div>
          {!canStartApplicationRun ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Generate tailored artifacts before starting an application run.
            </p>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Manual runs are still available as an advanced path and now submit automatically
              after required fields are completed and the success state is confirmed.
            </p>
          )}
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
                  job.status === 'applied'
                    ? 'success'
                    : job.status === 'shortlisted'
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
        {job.prefilterPass != null || matchAudit ? (
          <div className="mt-6 rounded-lg border bg-muted/30 p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Match Audit
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge
                variant={
                  decision === 'pass'
                    ? 'success'
                    : decision === 'reject'
                      ? 'secondary'
                      : 'outline'
                }
              >
                {decision}
              </Badge>
              {job.prefilterScore != null || matchAudit?.score != null ? (
                <Badge variant="outline">score {job.prefilterScore ?? matchAudit?.score}</Badge>
              ) : null}
              {matchAudit?.roleFamily?.name ? (
                <Badge variant="outline">role {matchAudit.roleFamily.name}</Badge>
              ) : null}
              {matchAudit?.seniority?.profile ? (
                <Badge variant="outline">seniority {matchAudit.seniority.profile}</Badge>
              ) : null}
              {matchAudit?.seniority?.minYearsRequired != null ? (
                <Badge variant="outline">{matchAudit.seniority.minYearsRequired}+ years</Badge>
              ) : null}
              {matchAudit?.llm?.reviewed ? (
                <Badge variant={matchAudit.llm.pass ? 'outline' : 'destructive'}>
                  LLM {matchAudit.llm.pass ? 'passed' : 'vetoed'}
                </Badge>
              ) : null}
            </div>
            {displayReasons.length > 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Reasons: {displayReasons.join(', ')}
              </p>
            ) : null}
            {matchAudit?.evidence?.matchedKeywords?.length ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Matched keywords: {matchAudit.evidence.matchedKeywords.join(', ')}
              </p>
            ) : null}
            {matchAudit?.evidence?.missingMustHaveKeywords?.length ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Missing must-have: {matchAudit.evidence.missingMustHaveKeywords.join(', ')}
              </p>
            ) : null}
            {matchAudit?.llm?.rationale ? (
              <p className="mt-2 text-sm text-muted-foreground">
                LLM rationale: {matchAudit.llm.rationale}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="mt-6 whitespace-pre-wrap rounded-lg bg-muted/50 p-4 text-sm leading-6 text-muted-foreground">
          {job.descriptionText ||
            'No description text was captured for this job.'}
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
