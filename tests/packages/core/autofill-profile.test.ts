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
    expect(parsed.salaryExpectationCurrency).toBe('USD');
  });

  test('country parser normalizes separators and casing', () => {
    expect(parseWorkAuthorizationCountriesCsv('us; ca gb')).toEqual(['US', 'CA', 'GB']);
  });
});
