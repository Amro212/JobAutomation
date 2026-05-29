import { describe, expect, test } from 'vitest';

import {
  applicantProfileInputSchema,
  applicantProfileSchema,
} from '../../../packages/core/src/applicant-profile';
import { defaultMinimalAutofillProfile } from '../../../packages/core/src/autofill-profile';

describe('applicant profile email verification config', () => {
  test('accepts Gmail OAuth email verification settings', () => {
    const input = applicantProfileInputSchema.parse({
      id: 'default',
      fullName: 'Amro Mousa',
      email: 'amromousa8@gmail.com',
      phone: '555-0100',
      location: 'Toronto, ON',
      summary: '',
      reusableContext: '',
      linkedinUrl: '',
      websiteUrl: '',
      baseResumeFileName: '',
      baseResumeTex: '',
      preferredCountries: ['CA'],
      autofillProfile: defaultMinimalAutofillProfile,
      emailVerification: {
        enabled: true,
        provider: 'gmail_oauth',
        gmailUserEmail: 'amromousa8@gmail.com',
        gmailClientId:
          '465613848408-big0oa8sg0a77q3rclb65nudnquht2g3.apps.googleusercontent.com',
        gmailClientSecret: 'secret',
        gmailRefreshToken: 'refresh-token',
      },
    });

    const stored = applicantProfileSchema.parse({
      ...input,
      updatedAt: new Date('2026-04-23T20:00:00.000Z'),
    });

    expect(stored.emailVerification).toMatchObject({
      enabled: true,
      provider: 'gmail_oauth',
      gmailUserEmail: 'amromousa8@gmail.com',
      gmailClientId:
        '465613848408-big0oa8sg0a77q3rclb65nudnquht2g3.apps.googleusercontent.com',
      gmailClientSecret: 'secret',
      gmailRefreshToken: 'refresh-token',
    });
  });
});
