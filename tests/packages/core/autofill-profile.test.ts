import { describe, expect, test } from 'vitest';

import {
  defaultMinimalAutofillProfile,
  minimalAutofillProfileSchema,
  parseWorkAuthorizationCountriesCsv
} from '../../../packages/core/src';

describe('autofill profile core schema', () => {
  test('default profile includes expanded autofill fields', () => {
    expect(defaultMinimalAutofillProfile).toMatchObject({
      workAuthorizationCountriesCsv: '',
      requiresSponsorship: '',
      requiresSponsorshipCountriesCsv: '',
      currentCountryCode: '',
      primaryCitizenshipCountryCode: '',
      currentCountryResidenceStatus: '',
      currentCountryResidenceStatusOther: '',
      legallyAuthorizedInCurrentCountry: '',
      needsSponsorshipInCurrentCountry: '',
      consentToInterviewRecording: '',
      acceptApplicationPrivacyNotices: '',
      consentToDemographicDataProcessing: '',
      lgbtqiaCommunityIdentification: '',
      clearanceStatus: '',
      relocation: '',
      workPreference: '',
      startDate: '',
      genderPronouns: '',
      genderPronounsCustom: '',
      raceEthnicity: '',
      veteranStatus: '',
      disabilityStatus: '',
      driversLicense: '',
      willingToTravel: '',
      yearsOfExperience: '',
      highestEducation: '',
      highestEducationSchool: '',
      highestEducationProgram: '',
      highestEducationDiscipline: '',
      highestEducationStartYear: '',
      highestEducationEndYear: '',
      criminalBackground: '',
      noticePeriod: '',
      currentlyEmployed: '',
      salaryExpectations: '',
      salaryExpectationAmount: '',
      salaryExpectationCurrency: 'USD',
      salaryExpectationPeriod: '',
      willingToWorkNightsWeekends: '',
      certificationsLicenses: '',
      languagesSpoken: '',
      knowsSomeoneAtCompany: ''
    });
  });

  test('schema accepts structured job-application answers', () => {
    const parsed = minimalAutofillProfileSchema.parse({
      workAuthorizationCountriesCsv: 'CA, US',
      requiresSponsorship: 'no',
      requiresSponsorshipCountriesCsv: '',
      currentCountryCode: 'CA',
      primaryCitizenshipCountryCode: 'CA',
      currentCountryResidenceStatus: 'citizen',
      currentCountryResidenceStatusOther: '',
      legallyAuthorizedInCurrentCountry: 'yes',
      needsSponsorshipInCurrentCountry: 'no',
      consentToInterviewRecording: 'yes',
      acceptApplicationPrivacyNotices: 'yes',
      consentToDemographicDataProcessing: 'yes',
      lgbtqiaCommunityIdentification: 'no',
      clearanceStatus: 'eligible',
      relocation: 'yes',
      workPreference: 'no_preference',
      startDate: '2 weeks after offer',
      genderPronouns: 'prefer_not_to_say',
      raceEthnicity: 'prefer_not_to_say',
      veteranStatus: 'not_veteran',
      disabilityStatus: 'no',
      driversLicense: 'yes',
      willingToTravel: '25',
      yearsOfExperience: '5_10',
      highestEducation: 'bachelor',
      highestEducationSchool: 'University of Toronto',
      highestEducationProgram: 'Bachelor of Science',
      highestEducationDiscipline: 'Computer Science',
      highestEducationStartYear: '2021',
      highestEducationEndYear: '2025',
      criminalBackground: 'disclose_if_required',
      noticePeriod: '2_weeks',
      currentlyEmployed: 'yes',
      salaryExpectations: '$160,000 yearly',
      salaryExpectationAmount: '160000',
      salaryExpectationCurrency: 'USD',
      salaryExpectationPeriod: 'yearly',
      willingToWorkNightsWeekends: 'occasionally',
      certificationsLicenses: 'AWS Solutions Architect',
      languagesSpoken: 'English, Spanish',
      knowsSomeoneAtCompany: 'no'
    });

    expect(parsed.willingToTravel).toBe('25');
    expect(parsed.yearsOfExperience).toBe('5_10');
    expect(parsed.criminalBackground).toBe('disclose_if_required');
    expect(parsed.highestEducationStartYear).toBe('2021');
    expect(parsed.highestEducationEndYear).toBe('2025');
    expect(parsed.salaryExpectationCurrency).toBe('USD');
    expect(parsed.currentCountryCode).toBe('CA');
    expect(parsed.primaryCitizenshipCountryCode).toBe('CA');
    expect(parsed.currentCountryResidenceStatus).toBe('citizen');
    expect(parsed.legallyAuthorizedInCurrentCountry).toBe('yes');
    expect(parsed.needsSponsorshipInCurrentCountry).toBe('no');
    expect(parsed.consentToInterviewRecording).toBe('yes');
    expect(parsed.acceptApplicationPrivacyNotices).toBe('yes');
    expect(parsed.consentToDemographicDataProcessing).toBe('yes');
    expect(parsed.lgbtqiaCommunityIdentification).toBe('no');
  });

  test('country parser normalizes separators and casing', () => {
    expect(parseWorkAuthorizationCountriesCsv('us; ca gb')).toEqual(['US', 'CA', 'GB']);
  });
});
