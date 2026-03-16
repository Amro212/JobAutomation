import { revalidatePath } from 'next/cache';

import { ApplicantProfileForm } from '../../components/setup/applicant-profile-form';
import { getApplicantProfile, saveApplicantProfile } from '../../lib/api';

async function saveSetup(formData: FormData): Promise<void> {
  'use server';

  const uploadedResume = formData.get('baseResumeFile');
  const hasUploadedResume = uploadedResume instanceof File && uploadedResume.size > 0;
  const uploadedText = hasUploadedResume ? await uploadedResume.text() : null;

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
    baseResumeTex: uploadedText ?? String(formData.get('baseResumeTex') ?? '')
  });

  revalidatePath('/setup');
}

export default async function SetupPage() {
  const profile = await getApplicantProfile();

  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Setup</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">Applicant context and base resume</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Batch A persists the reusable applicant context plus the canonical LaTeX resume source that later document milestones will build from.</p>
      </div>
      <ApplicantProfileForm action={saveSetup} profile={profile} />
    </section>
  );
}
