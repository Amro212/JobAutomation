import type { ApplicantEmailVerificationConfig } from '@jobautomation/core';

function envFlag(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

export function resolveEmailVerificationConfig(
  profileConfig: ApplicantEmailVerificationConfig | null | undefined
): ApplicantEmailVerificationConfig | null {
  const envEnabled = envFlag(process.env.JOBAUTOMATION_GREENHOUSE_EMAIL_VERIFICATION_ENABLED);
  if (!profileConfig?.enabled && !envEnabled) {
    return profileConfig ?? null;
  }

  return {
    enabled: profileConfig?.enabled || envEnabled,
    provider: 'gmail_oauth',
    gmailUserEmail:
      profileConfig?.gmailUserEmail?.trim() || process.env.JOBAUTOMATION_GMAIL_USER_EMAIL?.trim() || '',
    gmailClientId:
      profileConfig?.gmailClientId?.trim() || process.env.JOBAUTOMATION_GMAIL_CLIENT_ID?.trim() || '',
    gmailClientSecret:
      profileConfig?.gmailClientSecret?.trim() ||
      process.env.JOBAUTOMATION_GMAIL_CLIENT_SECRET?.trim() ||
      '',
    gmailRefreshToken:
      profileConfig?.gmailRefreshToken?.trim() ||
      process.env.JOBAUTOMATION_GMAIL_REFRESH_TOKEN?.trim() ||
      ''
  };
}
