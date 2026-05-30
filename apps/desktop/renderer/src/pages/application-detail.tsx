import { useEffect, useState } from 'react';
import { useParams } from 'react-router';

import { buildArtifactFileUrl, getApplicationRun } from '@renderer/lib/api';

export function ApplicationDetailPage() {
  const { runId = '' } = useParams();
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getApplicationRun>>>(null);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [coverLetterUrl, setCoverLetterUrl] = useState<string | null>(null);

  useEffect(() => {
    void getApplicationRun(runId).then(setDetail);
  }, [runId]);

  useEffect(() => {
    if (!detail) {
      return;
    }

    void Promise.all([
      detail.resumeArtifact ? buildArtifactFileUrl(detail.resumeArtifact.id, true) : null,
      detail.coverLetterArtifact ? buildArtifactFileUrl(detail.coverLetterArtifact.id, true) : null
    ]).then(([nextResumeUrl, nextCoverLetterUrl]) => {
      setResumeUrl(nextResumeUrl);
      setCoverLetterUrl(nextCoverLetterUrl);
    });
  }, [detail]);

  if (!detail) {
    return (
      <section className="p-6 rounded-3xl border border-border bg-card/55 backdrop-blur-[18px]">
        <p className="text-sm text-muted-foreground mb-6">Application run not found.</p>
      </section>
    );
  }

  return (
    <div className="grid">
      <section className="p-8 rounded-[2rem] border border-border bg-card/60 backdrop-blur-3xl shadow-[0_20px_60px_rgba(2,6,23,0.32)]">
        <h1 className="text-xl font-semibold mb-2">{detail.job.title}</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {detail.job.companyName} | {detail.run.status} | {detail.run.currentStep}
        </p>
      </section>

      <section className="p-6 rounded-3xl border border-border bg-card/55 backdrop-blur-[18px]">
        <h2 className="text-xl font-semibold mb-2">Artifacts</h2>
        <div className="inline-actions">
          {resumeUrl ? (
            <a className="button ghost" href={resumeUrl}>
              Download Resume
            </a>
          ) : null}
          {coverLetterUrl ? (
            <a className="button ghost" href={coverLetterUrl}>
              Download Cover Letter
            </a>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Log entries: {detail.logs.length} | Stored artifacts: {detail.artifacts.length}
        </p>
      </section>
    </div>
  );
}
