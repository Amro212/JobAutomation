import { revalidatePath } from 'next/cache';

import { Badge } from '@/components/ui/badge';
import { ApplicantProfileForm } from '@/components/setup/applicant-profile-form';
import { GenerateJobKeywordProfileButton } from '@/components/setup/generate-job-keyword-profile-button';
import { getApplicantProfile, saveApplicantProfile } from '@/lib/api';

async function saveSetup(formData: FormData): Promise<void> {
  'use server';

  const { profile: existing } = await getApplicantProfile();

  const uploadedResume = formData.get('baseResumeFile');
  const hasUploadedResume = uploadedResume instanceof File && uploadedResume.size > 0;
  const uploadedText = hasUploadedResume ? await uploadedResume.text() : null;

  const preferredCountries = formData
    .getAll('preferredCountry')
    .filter((v): v is string => typeof v === 'string' && v.trim().length === 2)
    .map((v) => v.toUpperCase());

  await saveApplicantProfile({
    id: String(formData.get('id') ?? 'default'),
    fullName: String(formData.get('fullName') ?? ''),
    email: String(formData.get('email') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    location: String(formData.get('location') ?? ''),
    summary: String(formData.get('summary') ?? ''),
    reusableContext: String(formData.get('reusableContext') ?? ''),
    linkedinUrl: String(formData.get('linkedinUrl') ?? ''),
    websiteUrl: String(formData.get('websiteUrl') ?? ''),
    baseResumeFileName: hasUploadedResume
      ? uploadedResume.name
      : String(formData.get('baseResumeFileName') ?? ''),
    baseResumeTex: uploadedText ?? String(formData.get('baseResumeTex') ?? ''),
    preferredCountries,
    jobKeywordProfile: existing?.jobKeywordProfile ?? null,
    jobKeywordProfileGeneratedAt: existing?.jobKeywordProfileGeneratedAt ?? null
  });

  revalidatePath('/setup');
}

export default async function SetupPage() {
  const { profile, readiness } = await getApplicantProfile();

  const generatedAtLabel =
    profile?.jobKeywordProfileGeneratedAt != null
      ? new Date(profile.jobKeywordProfileGeneratedAt).toLocaleString()
      : null;

  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Setup
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-foreground">
          Applicant context and base resume
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Batch A persists the reusable applicant context plus the canonical LaTeX resume source
          that later document milestones will build from.
        </p>
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
          <div className="rounded-lg border bg-card px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Base resume
            </p>
            <p className="mt-1">
              <Badge variant={readiness.hasBaseResume ? 'success' : 'destructive'}>
                {readiness.hasBaseResume ? 'Stored' : 'Not stored'}
              </Badge>
            </p>
          </div>
          <div className="rounded-lg border bg-card px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Applicant context
            </p>
            <p className="mt-1">
              <Badge variant={readiness.hasReusableContext ? 'success' : 'destructive'}>
                {readiness.hasReusableContext ? 'Stored' : 'Not stored'}
              </Badge>
            </p>
          </div>
          <div className="rounded-lg border bg-card px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Tailoring ready
            </p>
            <p className="mt-1">
              <Badge variant={readiness.readyForTailoring ? 'success' : 'warning'}>
                {readiness.readyForTailoring ? 'Yes' : 'Not yet'}
              </Badge>
            </p>
          </div>
        </div>
      </div>
      <ApplicantProfileForm action={saveSetup} profile={profile} />
      <GenerateJobKeywordProfileButton generatedAtLabel={generatedAtLabel} />
    </section>
  );
}
