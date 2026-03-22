'use server';

import { revalidatePath } from 'next/cache';

import { jobKeywordProfileSchema } from '@jobautomation/core';

import { generateApplicantJobKeywordProfile, getApplicantProfile, saveApplicantProfile } from '@/lib/api';

export async function generateJobFilterProfileAction(): Promise<void> {
  await generateApplicantJobKeywordProfile();
  revalidatePath('/setup');
}

export async function saveJobKeywordProfileAction(raw: unknown): Promise<void> {
  const parsed = jobKeywordProfileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error('Invalid filter profile. Check titles, keywords, and seniority.');
  }

  const { profile: existing } = await getApplicantProfile();
  if (!existing) {
    throw new Error('Save your applicant details above first.');
  }

  await saveApplicantProfile({
    id: existing.id,
    fullName: existing.fullName,
    email: existing.email,
    phone: existing.phone,
    location: existing.location,
    summary: existing.summary,
    reusableContext: existing.reusableContext,
    linkedinUrl: existing.linkedinUrl,
    websiteUrl: existing.websiteUrl,
    baseResumeFileName: existing.baseResumeFileName,
    baseResumeTex: existing.baseResumeTex,
    preferredCountries: existing.preferredCountries,
    autofillProfile: existing.autofillProfile,
    jobKeywordProfile: parsed.data,
    jobKeywordProfileGeneratedAt: existing.jobKeywordProfileGeneratedAt ?? new Date()
  });

  revalidatePath('/setup');
}
