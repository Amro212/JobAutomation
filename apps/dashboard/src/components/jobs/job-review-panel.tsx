import type { JobRecord } from '@jobautomation/core';

function InfoCard({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</dt>
      <dd className="mt-2 text-sm leading-6 text-slate-900">{value}</dd>
    </div>
  );
}

export function JobReviewPanel({
  job,
  scoringEnabled,
  flashMessage,
  flashError,
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
    <section className="space-y-6 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Review Workflow</p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-900">Triage and shortlist</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Persist notes, move this job into or out of the shortlist, and optionally request an
            on-demand summary and score.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {job.status === 'shortlisted' ? (
            <form action={removeFromShortlistAction}>
              <button
                type="submit"
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-900 hover:text-slate-900"
              >
                Remove from shortlist
              </button>
            </form>
          ) : (
            <form action={addToShortlistAction}>
              <button
                type="submit"
                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
              >
                Add to shortlist
              </button>
            </form>
          )}
          <form action={scoreAction}>
            <button
              type="submit"
              disabled={!scoringEnabled}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Generate summary and score
            </button>
          </form>
        </div>
      </div>

      {flashMessage ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {flashMessage}
        </div>
      ) : null}

      {flashError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {flashError}
        </div>
      ) : null}

      {!scoringEnabled ? (
        <p className="text-sm text-slate-600">
          Configure OpenRouter to enable on-demand scoring.
        </p>
      ) : null}

      <form action={saveReviewAction} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-[220px,1fr]">
          <label className="space-y-2 text-sm text-slate-700">
            <span className="font-medium">Review status</span>
            <select
              name="status"
              aria-label="Review status"
              defaultValue={job.status}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
            >
              <option value="discovered">Discovered</option>
              <option value="reviewing">Reviewing</option>
              <option value="shortlisted">Shortlisted</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label className="space-y-2 text-sm text-slate-700">
            <span className="font-medium">Review notes</span>
            <textarea
              name="reviewNotes"
              aria-label="Review notes"
              defaultValue={job.reviewNotes}
              rows={5}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
            />
          </label>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Save review
          </button>
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
