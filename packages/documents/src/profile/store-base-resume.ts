import type { ApplicantProfile, ApplicantProfileInput } from '@jobautomation/core';
import type { ApplicantProfileRepository } from '@jobautomation/db';

export type StoreBaseResumeInput = {
  applicantProfileRepository: ApplicantProfileRepository;
  profile: ApplicantProfile | null;
  baseResumeFileName: string;
  baseResumeTex: string;
};

export async function storeBaseResume(input: StoreBaseResumeInput): Promise<ApplicantProfile> {
  const profile: ApplicantProfileInput = {
    id: input.profile?.id ?? 'default',
    fullName: input.profile?.fullName ?? '',
    email: input.profile?.email ?? '',
    phone: input.profile?.phone ?? '',
    location: input.profile?.location ?? '',
    summary: input.profile?.summary ?? '',
    reusableContext: input.profile?.reusableContext ?? '',
    linkedinUrl: input.profile?.linkedinUrl ?? '',
    websiteUrl: input.profile?.websiteUrl ?? '',
    baseResumeFileName: input.baseResumeFileName,
    baseResumeTex: input.baseResumeTex
  };

  return input.applicantProfileRepository.save(profile);
}
