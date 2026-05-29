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
      <section className="card">
        <p className="section-copy">Application run not found.</p>
      </section>
    );
  }

  return (
    <div className="grid">
      <section className="hero">
        <h1 className="section-title">{detail.job.title}</h1>
        <p className="section-copy">
          {detail.job.companyName} | {detail.run.status} | {detail.run.currentStep}
        </p>
      </section>

      <section className="card">
        <h2 className="section-title">Artifacts</h2>
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
        <p className="section-copy">
          Log entries: {detail.logs.length} | Stored artifacts: {detail.artifacts.length}
        </p>
      </section>
    </div>
  );
}
