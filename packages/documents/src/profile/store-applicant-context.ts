import type { ApplicantProfile, ApplicantProfileInput } from '@jobautomation/core';
import type { ApplicantProfileRepository } from '@jobautomation/db';

export type StoreApplicantContextInput = {
  applicantProfileRepository: ApplicantProfileRepository;
  profile: ApplicantProfile | null;
  applicantContext: string;
};

export async function storeApplicantContext(
  input: StoreApplicantContextInput
): Promise<ApplicantProfile> {
  const profile: ApplicantProfileInput = {
    id: input.profile?.id ?? 'default',
    fullName: input.profile?.fullName ?? '',
    email: input.profile?.email ?? '',
    phone: input.profile?.phone ?? '',
    location: input.profile?.location ?? '',
    summary: input.profile?.summary ?? '',
    reusableContext: input.applicantContext,
    linkedinUrl: input.profile?.linkedinUrl ?? '',
    websiteUrl: input.profile?.websiteUrl ?? '',
    baseResumeFileName: input.profile?.baseResumeFileName ?? '',
    baseResumeTex: input.profile?.baseResumeTex ?? '',
    preferredCountries: input.profile?.preferredCountries ?? [],
    autofillProfile: input.profile?.autofillProfile,
    jobKeywordProfile: input.profile?.jobKeywordProfile ?? null,
    jobKeywordProfileGeneratedAt: input.profile?.jobKeywordProfileGeneratedAt ?? null
  };

  return input.applicantProfileRepository.save(profile);
}
