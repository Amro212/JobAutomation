import type { ApplicantProfile } from '@jobautomation/core';

function appendLine(lines: string[], label: string, value: string | null | undefined): void {
  const normalized = value?.trim();
  if (!normalized) {
    return;
  }

  lines.push(`- ${label}: ${normalized}`);
}

function appendEnumLine(
  lines: string[],
  label: string,
  value: string | null | undefined,
  mapping: Record<string, string>
): void {
  if (!value) {
    return;
  }

  const normalized = mapping[value];
  if (!normalized) {
    return;
  }

  lines.push(`- ${label}: ${normalized}`);
}

export function formatApplicantContext(profile: ApplicantProfile): string {
  const base = profile.reusableContext.trim();
  const autofill = profile.autofillProfile;
  const structured: string[] = [];

  appendEnumLine(structured, 'Requires sponsorship', autofill.requiresSponsorship, {
    yes: 'Yes',
    no: 'No'
  });
  appendLine(structured, 'Sponsorship countries', autofill.requiresSponsorshipCountriesCsv);
  appendEnumLine(structured, 'Security clearance', autofill.clearanceStatus, {
    none: 'None / never held',
    held: 'Held before',
    eligible: 'Eligible, not held',
    unsure: 'Unsure'
  });
  appendEnumLine(structured, 'Willing to relocate', autofill.relocation, {
    yes: 'Yes',
    no: 'No'
  });
  appendEnumLine(structured, 'Work preference', autofill.workPreference, {
    no_preference: 'No preference',
    remote: 'Remote',
    hybrid: 'Hybrid',
    onsite: 'On-site'
  });
  appendLine(structured, 'Earliest start date', autofill.startDate);
  appendEnumLine(structured, 'Gender / pronouns', autofill.genderPronouns, {
    male: 'Male',
    female: 'Female',
    non_binary: 'Non-binary',
    prefer_not_to_say: 'Prefer not to say',
    custom: 'Custom'
  });
  appendLine(structured, 'Custom gender / pronouns', autofill.genderPronounsCustom);
  appendEnumLine(structured, 'Race / ethnicity', autofill.raceEthnicity, {
    hispanic_or_latino: 'Hispanic or Latino',
    white: 'White',
    black_or_african_american: 'Black or African American',
    asian: 'Asian',
    native_hawaiian_or_pacific_islander: 'Native Hawaiian or Pacific Islander',
    american_indian_or_alaska_native: 'American Indian or Alaska Native',
    two_or_more: 'Two or more races',
    prefer_not_to_say: 'Prefer not to say'
  });
  appendEnumLine(structured, 'Veteran status', autofill.veteranStatus, {
    not_veteran: 'Not a veteran',
    veteran: 'Veteran',
    protected_veteran: 'Protected veteran',
    prefer_not_to_say: 'Prefer not to say'
  });
  appendEnumLine(structured, 'Disability status', autofill.disabilityStatus, {
    no: 'No',
    yes_prefer_not_to_specify: 'Yes (prefer not to specify)',
    yes_specific_accommodation: 'Yes (specific accommodation)',
    prefer_not_to_say: 'Prefer not to say'
  });
  appendEnumLine(structured, 'Driver’s license', autofill.driversLicense, {
    yes: 'Yes',
    no: 'No'
  });
  appendEnumLine(structured, 'Willing to travel', autofill.willingToTravel, {
    0: '0%',
    25: 'Up to 25%',
    50: 'Up to 50%',
    75: 'Up to 75%',
    100: '100%'
  });
  appendEnumLine(structured, 'Years of experience', autofill.yearsOfExperience, {
    lt_1: 'Less than 1 year',
    1_3: '1-3 years',
    3_5: '3-5 years',
    5_10: '5-10 years',
    '10_plus': '10+ years'
  });
  appendEnumLine(structured, 'Highest education', autofill.highestEducation, {
    high_school: 'High school',
    associate: 'Associate',
    bachelor: 'Bachelor’s',
    master: 'Master’s',
    phd: 'PhD',
    trade_vocational: 'Trade / Vocational'
  });
  appendLine(structured, 'Education school', autofill.highestEducationSchool);
  appendLine(structured, 'Education program', autofill.highestEducationProgram);
  appendLine(structured, 'Education discipline', autofill.highestEducationDiscipline);
  appendEnumLine(structured, 'Criminal background', autofill.criminalBackground, {
    yes: 'Yes',
    no: 'No',
    disclose_if_required: 'Will disclose details if required'
  });
  appendEnumLine(structured, 'Notice period', autofill.noticePeriod, {
    immediate: 'Immediate',
    '2_weeks': '2 weeks',
    '1_month': '1 month',
    '2_plus_months': '2+ months'
  });
  appendEnumLine(structured, 'Currently employed', autofill.currentlyEmployed, {
    yes: 'Yes',
    no: 'No'
  });
  appendLine(structured, 'Salary expectations', autofill.salaryExpectations);
  if (autofill.salaryExpectationAmount.trim().length > 0) {
    appendLine(structured, 'Salary expectation amount', autofill.salaryExpectationAmount);
    appendLine(structured, 'Salary expectation currency', autofill.salaryExpectationCurrency);
    appendEnumLine(structured, 'Salary expectation period', autofill.salaryExpectationPeriod, {
      yearly: 'Yearly',
      hourly: 'Hourly'
    });
  }
  appendEnumLine(structured, 'Willing to work nights / weekends', autofill.willingToWorkNightsWeekends, {
    yes: 'Yes',
    no: 'No',
    occasionally: 'Occasionally'
  });
  appendLine(structured, 'Certifications / licenses', autofill.certificationsLicenses);
  appendLine(structured, 'Languages spoken', autofill.languagesSpoken);
  appendEnumLine(structured, 'Knows someone at the company', autofill.knowsSomeoneAtCompany, {
    yes: 'Yes',
    no: 'No'
  });

  if (structured.length === 0) {
    return base;
  }

  const sections = [];
  if (base.length > 0) {
    sections.push(base);
  }
  sections.push(['Application answer profile:', ...structured].join('\n'));
  return sections.join('\n\n');
}

export function loadApplicantContext(profile: ApplicantProfile | null): {
  applicantContext: string;
} {
  if (!profile) {
    throw new Error('An applicant profile has not been saved yet.');
  }

  return {
    applicantContext: formatApplicantContext(profile)
  };
}
