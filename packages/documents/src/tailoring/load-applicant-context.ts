import type { ApplicantProfile } from '@jobautomation/core';

export function loadApplicantContext(profile: ApplicantProfile | null): {
  applicantContext: string;
} {
  if (!profile) {
    throw new Error('An applicant profile has not been saved yet.');
  }

  return {
    applicantContext: profile.reusableContext.trim()
  };
}
