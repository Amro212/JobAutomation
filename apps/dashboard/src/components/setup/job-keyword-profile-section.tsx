import type { ApplicantProfile } from '@jobautomation/core';

import { GenerateJobKeywordProfileButton } from '@/components/setup/generate-job-keyword-profile-button';
import { JobKeywordProfileEditor } from '@/components/setup/job-keyword-profile-editor';

export function JobKeywordProfileSection({ profile }: { profile: ApplicantProfile | null }) {
  const generatedAtLabel =
    profile?.jobKeywordProfileGeneratedAt != null
      ? new Date(profile.jobKeywordProfileGeneratedAt).toLocaleString()
      : null;

  const profileJson = profile?.jobKeywordProfile ? JSON.stringify(profile.jobKeywordProfile) : '';

  return (
    <section className="space-y-6 rounded-xl border bg-card p-6 shadow-sm">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold tracking-tight">Job filter profile</h3>
        <p className="text-sm text-muted-foreground">
          One AI pass can extract titles and keywords from your setup. Edit lists anytime; pre-filtering before
          scoring uses only fast string checks (no extra API calls).
        </p>
      </div>

      <GenerateJobKeywordProfileButton generatedAtLabel={generatedAtLabel} />

      <JobKeywordProfileEditor profileJson={profileJson} hasApplicantRow={profile != null} />
    </section>
  );
}
