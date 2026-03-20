import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import {
  generateJobArtifacts,
  getApplicantProfile,
  getApiBaseUrl,
  getJob,
  getJobArtifacts
} from '../../../../lib/api';

function getSearchParamValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function buildJobArtifactsHref(jobId: string, values: Record<string, string>): string {
  const searchParams = new URLSearchParams(values);
  const query = searchParams.toString();
  return query.length > 0 ? `/jobs/${jobId}/artifacts?${query}` : `/jobs/${jobId}/artifacts`;
}

function getGenerateMessage(mode: 'both' | 'resume' | 'cover-letter'): string {
  if (mode === 'resume') {
    return 'Generated tailored resume.';
  }

  if (mode === 'cover-letter') {
    return 'Generated tailored cover letter.';
  }

  return 'Generated tailored resume and cover letter.';
}

function buildArtifactUrl(artifactId: string, download = false): string {
  const baseUrl = getApiBaseUrl();
  const search = download ? '?download=1' : '';
  return `${baseUrl}/artifacts/${artifactId}/file${search}`;
}

export default async function JobArtifactsPage({
  params,
  searchParams
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { jobId } = await params;
  const resolvedSearchParams = await searchParams;
  const [job, profileState, artifacts] = await Promise.all([
    getJob(jobId),
    getApplicantProfile(),
    getJobArtifacts(jobId)
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

  async function generateArtifactsAction(formData: FormData): Promise<void> {
    'use server';
    const payloadMode = String(formData.get('mode') ?? 'both') as
      | 'both'
      | 'resume'
      | 'cover-letter';

    let warningText = '';
    try {
      const result = await generateJobArtifacts(jobId, { mode: payloadMode });
      revalidatePath(`/jobs/${jobId}/artifacts`);
      revalidatePath(`/jobs/${jobId}`);
      if (result.warnings?.length) {
        warningText = ` (warnings: ${result.warnings.join('; ')})`;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate artifacts.';
      redirect(buildJobArtifactsHref(jobId, { error: message }));
    }

    redirect(buildJobArtifactsHref(jobId, { message: `${getGenerateMessage(payloadMode)}${warningText}` }));
  }

  const readiness = profileState.readiness;
  const canGenerate = readiness.readyForTailoring;
  const latestPdfArtifacts = artifacts
    .filter((artifact) => artifact.format === 'pdf')
    .reduce<Record<string, (typeof artifacts)[number]>>((accumulator, artifact) => {
      const current = accumulator[artifact.kind];
      if (!current || artifact.version > current.version) {
        accumulator[artifact.kind] = artifact;
      }

      return accumulator;
    }, {});

  return (
    <section className="space-y-6">
      <div className="rounded-3xl bg-white p-8 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Artifacts</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">{job.title}</h2>
            <p className="mt-2 text-sm text-slate-600">
              {job.companyName} - {job.location || 'Unspecified'}
            </p>
          </div>
          <form action={generateArtifactsAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
              Generate mode
              <select
                name="mode"
                defaultValue="both"
                disabled={!canGenerate}
                className="min-w-56 rounded-full border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                <option value="both">Resume and cover letter</option>
                <option value="resume">Resume only</option>
                <option value="cover-letter">Cover letter only</option>
              </select>
            </label>
            <button
              type="submit"
              disabled={!canGenerate}
              className="rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              Generate tailored artifacts
            </button>
          </form>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Base resume</p>
            <p className="mt-1 font-medium text-slate-900">
              {readiness.hasBaseResume ? 'Stored' : 'Missing'}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Applicant context</p>
            <p className="mt-1 font-medium text-slate-900">
              {readiness.hasReusableContext ? 'Stored' : 'Missing'}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Tailoring</p>
            <p className="mt-1 font-medium text-slate-900">
              {canGenerate ? 'Ready' : 'Not ready'}
            </p>
          </div>
        </div>

        {flashMessage ? (
          <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {flashMessage}
          </p>
        ) : null}
        {flashError ? (
          <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {flashError}
          </p>
        ) : null}

        {!canGenerate ? (
          <p className="mt-4 text-sm text-slate-600">
            Save the canonical LaTeX resume and reusable applicant context in Setup before generating artifacts.
          </p>
        ) : null}
      </div>

      {Object.keys(latestPdfArtifacts).length > 0 ? (
        <div className="rounded-3xl bg-white p-8 shadow-sm">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Preview</p>
            <h3 className="mt-2 text-xl font-semibold text-slate-900">Rendered PDFs</h3>
            <p className="mt-2 text-sm text-slate-600">
              These are the compiled outputs served by the API. Open or download the latest version for each artifact kind.
            </p>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            {Object.values(latestPdfArtifacts).map((artifact) => (
              <article key={artifact.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{artifact.kind}</p>
                    <h4 className="mt-1 text-sm font-semibold text-slate-900">
                      v{artifact.version} - {artifact.fileName}
                    </h4>
                  </div>
                  <div className="flex flex-col items-end gap-2 text-sm">
                    <a
                      href={buildArtifactUrl(artifact.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-slate-700 underline"
                    >
                      Open PDF
                    </a>
                    <a
                      href={buildArtifactUrl(artifact.id, true)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-slate-700 underline"
                    >
                      Download PDF
                    </a>
                  </div>
                </div>
                <iframe
                  title={`${artifact.kind} preview`}
                  src={buildArtifactUrl(artifact.id)}
                  className="mt-4 h-[28rem] w-full rounded-xl border border-slate-200 bg-white"
                />
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-3xl bg-white p-8 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Generated</p>
            <h3 className="mt-2 text-xl font-semibold text-slate-900">Resume and cover letter versions</h3>
          </div>
          <Link href={`/jobs/${jobId}`} className="text-sm font-medium text-slate-700 underline">
            Back to job
          </Link>
        </div>

        {artifacts.length === 0 ? (
          <p className="mt-6 text-sm text-slate-600">
            No artifacts have been generated for this job yet.
          </p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                  <th className="px-3 py-2">Kind</th>
                  <th className="px-3 py-2">Format</th>
                  <th className="px-3 py-2">Version</th>
                  <th className="px-3 py-2">File</th>
                  <th className="px-3 py-2">Storage path</th>
                  <th className="px-3 py-2">Profile snapshot</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {artifacts.map((artifact) => (
                  <tr key={artifact.id} className="align-top">
                    <td className="px-3 py-3 font-medium text-slate-900">{artifact.kind}</td>
                    <td className="px-3 py-3 text-slate-700">{artifact.format}</td>
                    <td className="px-3 py-3 text-slate-700">{artifact.version}</td>
                    <td className="px-3 py-3 text-slate-700">{artifact.fileName}</td>
                    <td className="px-3 py-3 text-slate-700">
                      <code className="text-xs">{artifact.storagePath}</code>
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {artifact.applicantProfileId
                        ? `${artifact.applicantProfileId} @ ${String(artifact.applicantProfileUpdatedAt ?? 'n/a')}`
                        : 'n/a'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
