import type { JobRecord } from '@jobautomation/core';

import { Textarea } from '@/components/ui/textarea';
import { SubmitButton } from '@/components/submit-button';

function InfoCard({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/50 p-4">
      <dt className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-2 text-sm leading-6 text-foreground">{value}</dd>
    </div>
  );
}

export function JobReviewPanel({
  job,
  scoringEnabled,
  saveReviewAction,
  addToShortlistAction,
  removeFromShortlistAction,
  scoreAction
}: {
  job: JobRecord;
  scoringEnabled: boolean;
  flashMessage?: string;
  flashError?: string;
  saveReviewAction: (formData: FormData) => Promise<void>;
  addToShortlistAction: () => Promise<void>;
  removeFromShortlistAction: () => Promise<void>;
  scoreAction: () => Promise<void>;
}) {
  return (
    <section className="space-y-6 rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Review Workflow
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-foreground">Triage and shortlist</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Persist notes, move this job into or out of the shortlist, and optionally request an
            on-demand summary and score.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {job.status === 'shortlisted' ? (
            <form action={removeFromShortlistAction}>
              <SubmitButton variant="outline" pendingText="Removing...">
                Remove from shortlist
              </SubmitButton>
            </form>
          ) : (
            <form action={addToShortlistAction}>
              <SubmitButton variant="success" pendingText="Adding...">
                Add to shortlist
              </SubmitButton>
            </form>
          )}
          <form action={scoreAction}>
            <SubmitButton
              disabled={!scoringEnabled}
              pendingText="Generating..."
            >
              Generate summary and score
            </SubmitButton>
          </form>
        </div>
      </div>

      {!scoringEnabled ? (
        <p className="text-sm text-muted-foreground">
          Configure OpenRouter to enable on-demand scoring.
        </p>
      ) : null}

      <form action={saveReviewAction} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-[220px,1fr]">
          <label className="space-y-2 text-sm">
            <span className="font-medium">Review status</span>
            <select
              name="status"
              aria-label="Review status"
              defaultValue={job.status}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="discovered">Discovered</option>
              <option value="reviewing">Reviewing</option>
              <option value="shortlisted">Shortlisted</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium">Review notes</span>
            <Textarea
              name="reviewNotes"
              aria-label="Review notes"
              defaultValue={job.reviewNotes}
              rows={5}
            />
          </label>
        </div>
        <div className="flex justify-end">
          <SubmitButton pendingText="Saving...">Save review</SubmitButton>
        </div>
      </form>

      <div className="grid gap-4 md:grid-cols-2">
        <InfoCard label="Summary" value={job.reviewSummary ?? 'No summary generated yet.'} />
        <InfoCard
          label="Score"
          value={job.reviewScore == null ? 'No score generated yet.' : `${job.reviewScore}/100`}
        />
      </div>

      <InfoCard
        label="Score reasoning"
        value={job.reviewScoreReasoning ?? 'No score reasoning generated yet.'}
      />
    </section>
  );
}
