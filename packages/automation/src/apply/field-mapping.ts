import type { ApplicantProfile } from '@jobautomation/core';

import type { ApplicationFieldMapping } from './contracts';

export function buildApplicationFieldMapping(
  applicantProfile: ApplicantProfile | null
): ApplicationFieldMapping {
  if (!applicantProfile) {
    return {};
  }

  return {
    fullName: applicantProfile.fullName.trim(),
    firstName: applicantProfile.fullName.trim().split(/\s+/)[0] ?? '',
    lastName: applicantProfile.fullName.trim().split(/\s+/).slice(1).join(' '),
    email: applicantProfile.email.trim(),
    phone: applicantProfile.phone.trim(),
    location: applicantProfile.location.trim(),
    linkedinUrl: applicantProfile.linkedinUrl.trim(),
    websiteUrl: applicantProfile.websiteUrl.trim(),
    summary: applicantProfile.summary.trim(),
    reusableContext: applicantProfile.reusableContext.trim()
  };
}
