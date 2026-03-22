import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import type { ArtifactRecord } from '@jobautomation/core';

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
import {
  generateJobArtifacts,
  getApplicantProfile,
  getApiBaseUrl,
  getJob,
  getJobArtifacts
} from '@/lib/api';

function buildJobArtifactsHref(jobId: string, values: Record<string, string>): string {
  const searchParams = new URLSearchParams(values);
  const query = searchParams.toString();
  return query.length > 0 ? `/jobs/${jobId}/artifacts?${query}` : `/jobs/${jobId}/artifacts`;
}

function getGenerateMessage(mode: 'both' | 'resume' | 'cover-letter'): string {
  if (mode === 'resume') return 'Generated tailored resume.';
  if (mode === 'cover-letter') return 'Generated tailored cover letter.';
  return 'Generated tailored resume and cover letter.';
}

/** Latest resume-variant version has TeX/log but no PDF (Tectonic did not produce a PDF). */
function latestResumeVariantVersionWithoutPdf(artifacts: ArtifactRecord[]): number | null {
  const resume = artifacts.filter((a) => a.kind === 'resume-variant');
  if (resume.length === 0) return null;
  const maxVersion = Math.max(...resume.map((a) => a.version));
  const atLatest = resume.filter((a) => a.version === maxVersion);
  if (atLatest.some((a) => a.format === 'pdf')) return null;
  if (atLatest.some((a) => a.format === 'tex' || a.format === 'log')) {
    return maxVersion;
  }
  return null;
}

function appendResumePdfMissingWarning(
  mode: 'both' | 'resume' | 'cover-letter',
  generatedArtifacts: ArtifactRecord[],
  prior: string[]
): string[] {
  if (mode !== 'both' && mode !== 'resume') return prior;
  const resume = generatedArtifacts.filter((a) => a.kind === 'resume-variant');
  if (resume.length === 0) return prior;
  const maxVersion = Math.max(...resume.map((a) => a.version));
  const atLatest = resume.filter((a) => a.version === maxVersion);
  if (atLatest.some((a) => a.format === 'pdf')) return prior;
  if (!atLatest.some((a) => a.format === 'tex') && !atLatest.some((a) => a.format === 'log')) {
    return prior;
  }
  return [
    ...prior,
    `Resume v${maxVersion}: no PDF was produced (LaTeX compile failed). Open resume-variant tectonic.log in the table below.`
  ];
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
      const merged = appendResumePdfMissingWarning(
        payloadMode,
        result.artifacts,
        result.warnings ?? []
      );
      if (merged.length > 0) {
        warningText = ` (warnings: ${merged.join('; ')})`;
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
    .reduce<Record<string, ArtifactRecord>>((accumulator, artifact) => {
      const current = accumulator[artifact.kind];
      if (!current || artifact.version > current.version) {
        accumulator[artifact.kind] = artifact;
      }
      return accumulator;
    }, {});

  const resumeMissingPdfVersion = latestResumeVariantVersionWithoutPdf(artifacts);

  // Read but don't display flash params - FlashToast handles them
  void resolvedSearchParams;

  return (
    <section className="space-y-6">
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Artifacts
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">{job.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {job.companyName} - {job.location || 'Unspecified'}
            </p>
          </div>
          <form action={generateArtifactsAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex flex-col gap-2 text-sm font-medium">
              Generate mode
              <select
                name="mode"
                defaultValue="both"
                disabled={!canGenerate}
                className="flex h-9 min-w-56 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="both">Resume and cover letter</option>
                <option value="resume">Resume only</option>
                <option value="cover-letter">Cover letter only</option>
              </select>
            </label>
            <SubmitButton disabled={!canGenerate} pendingText="Generating...">
              Generate tailored artifacts
            </SubmitButton>
          </form>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border bg-muted/50 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Base resume
            </p>
            <p className="mt-1 font-medium">
              <Badge variant={readiness.hasBaseResume ? 'success' : 'destructive'}>
                {readiness.hasBaseResume ? 'Stored' : 'Missing'}
              </Badge>
            </p>
          </div>
          <div className="rounded-lg border bg-muted/50 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Applicant context
            </p>
            <p className="mt-1 font-medium">
              <Badge variant={readiness.hasReusableContext ? 'success' : 'destructive'}>
                {readiness.hasReusableContext ? 'Stored' : 'Missing'}
              </Badge>
            </p>
          </div>
          <div className="rounded-lg border bg-muted/50 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Tailoring
            </p>
            <p className="mt-1 font-medium">
              <Badge variant={canGenerate ? 'success' : 'warning'}>
                {canGenerate ? 'Ready' : 'Not ready'}
              </Badge>
            </p>
          </div>
        </div>

        {!canGenerate ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Save the canonical LaTeX resume and reusable applicant context in Setup before generating artifacts.
          </p>
        ) : null}
      </div>

      {Object.keys(latestPdfArtifacts).length > 0 || resumeMissingPdfVersion != null ? (
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Preview
            </p>
            <h3 className="mt-2 text-xl font-semibold text-foreground">Rendered PDFs</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              These are the compiled outputs served by the API. Open or download the latest version
              for each artifact kind.
            </p>
            {resumeMissingPdfVersion != null ? (
              <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                Latest tailored resume (v{resumeMissingPdfVersion}) has no PDF—only LaTeX and/or a
                compile log were saved. The resume is omitted from this grid until Tectonic succeeds;
                check the <span className="font-medium">tectonic.log</span> row for{' '}
                <span className="font-medium">resume-variant</span> below.
              </p>
            ) : null}
          </div>

          {Object.keys(latestPdfArtifacts).length > 0 ? (
            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              {Object.values(latestPdfArtifacts).map((artifact) => (
                <article key={artifact.id} className="rounded-lg border bg-muted/50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        {artifact.kind}
                      </p>
                      <h4 className="mt-1 text-sm font-semibold">
                        v{artifact.version} - {artifact.fileName}
                      </h4>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Button variant="link" size="sm" className="h-auto p-0" asChild>
                        <a href={buildArtifactUrl(artifact.id)} target="_blank" rel="noreferrer">
                          Open PDF
                        </a>
                      </Button>
                      <Button variant="link" size="sm" className="h-auto p-0" asChild>
                        <a href={buildArtifactUrl(artifact.id, true)} target="_blank" rel="noreferrer">
                          Download PDF
                        </a>
                      </Button>
                    </div>
                  </div>
                  <iframe
                    title={`${artifact.kind} preview`}
                    src={buildArtifactUrl(artifact.id)}
                    className="mt-4 h-[28rem] w-full rounded-lg border bg-card"
                  />
                </article>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Generated
            </p>
            <h3 className="mt-2 text-xl font-semibold text-foreground">
              Resume and cover letter versions
            </h3>
          </div>
          <Button variant="link" className="h-auto p-0" asChild>
            <Link href={`/jobs/${jobId}`}>Back to job</Link>
          </Button>
        </div>

        {artifacts.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">
            No artifacts have been generated for this job yet.
          </p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Kind</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Storage path</TableHead>
                  <TableHead>Profile snapshot</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {artifacts.map((artifact) => (
                  <TableRow key={artifact.id}>
                    <TableCell className="font-medium">{artifact.kind}</TableCell>
                    <TableCell>{artifact.format}</TableCell>
                    <TableCell>{artifact.version}</TableCell>
                    <TableCell>{artifact.fileName}</TableCell>
                    <TableCell>
                      <code className="text-xs text-muted-foreground">{artifact.storagePath}</code>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {artifact.applicantProfileId
                        ? `${artifact.applicantProfileId} @ ${String(artifact.applicantProfileUpdatedAt ?? 'n/a')}`
                        : 'n/a'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </section>
  );
}
