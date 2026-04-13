import { describe, expect, test } from 'vitest';

import { parseMinimalAutofillFormData } from '../../../apps/dashboard/src/lib/minimal-autofill-form';

describe('minimal autofill form parser', () => {
  test('parses new consent and sensitive self-id controls', () => {
    const formData = new FormData();
    formData.set('autofill_requiresSponsorship', 'no');
    formData.set('autofill_currentCountryCode', 'ca');
    formData.set('autofill_primaryCitizenshipCountryCode', 'ca');
    formData.set('autofill_currentCountryResidenceStatus', 'citizen');
    formData.set('autofill_legallyAuthorizedInCurrentCountry', 'yes');
    formData.set('autofill_needsSponsorshipInCurrentCountry', 'no');
    formData.set('autofill_consentToInterviewRecording', 'yes');
    formData.set('autofill_acceptApplicationPrivacyNotices', 'yes');
    formData.set('autofill_consentToDemographicDataProcessing', 'no');
    formData.set('autofill_lgbtqiaCommunityIdentification', 'prefer_not_to_say');
    formData.set('autofill_veteranStatus', 'protected_veteran');
    formData.set('autofill_highestEducationStartYear', '2021');
    formData.set('autofill_highestEducationEndYear', '2026');

    const parsed = parseMinimalAutofillFormData(formData);

    expect(parsed.currentCountryCode).toBe('CA');
    expect(parsed.primaryCitizenshipCountryCode).toBe('CA');
    expect(parsed.currentCountryResidenceStatus).toBe('citizen');
    expect(parsed.legallyAuthorizedInCurrentCountry).toBe('yes');
    expect(parsed.needsSponsorshipInCurrentCountry).toBe('no');
    expect(parsed.consentToInterviewRecording).toBe('yes');
    expect(parsed.acceptApplicationPrivacyNotices).toBe('yes');
    expect(parsed.consentToDemographicDataProcessing).toBe('no');
    expect(parsed.lgbtqiaCommunityIdentification).toBe('prefer_not_to_say');
    expect(parsed.veteranStatus).toBe('protected_veteran');
    expect(parsed.highestEducationStartYear).toBe('2021');
    expect(parsed.highestEducationEndYear).toBe('2026');
  });
});
