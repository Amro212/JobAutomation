import type { ApplicantProfile } from '@jobautomation/core';

export function loadBaseResume(profile: ApplicantProfile | null): {
  baseResumeFileName: string;
  baseResumeTex: string;
} {
  if (!profile || profile.baseResumeTex.trim().length === 0) {
    throw new Error('A canonical LaTeX resume has not been uploaded yet.');
  }

  return {
    baseResumeFileName: profile.baseResumeFileName || 'resume.tex',
    baseResumeTex: profile.baseResumeTex
  };
}
