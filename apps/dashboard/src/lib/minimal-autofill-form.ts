import { minimalAutofillProfileSchema, type MinimalAutofillProfile } from '@jobautomation/core';

function formatSalaryExpectation(
  amount: string,
  currency: string,
  period: string
): string {
  const normalizedAmount = amount.trim();
  if (!normalizedAmount) {
    return '';
  }

  const amountNumber = Number(normalizedAmount);
  const formattedAmount = Number.isFinite(amountNumber)
    ? new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'USD',
        maximumFractionDigits: 0
      }).format(amountNumber)
    : normalizedAmount;
  const formattedPeriod = period === 'hourly' ? 'hourly' : period === 'yearly' ? 'yearly' : '';

  return formattedPeriod ? `${formattedAmount} ${formattedPeriod}` : formattedAmount;
}

export function parseMinimalAutofillFormData(formData: FormData): MinimalAutofillProfile {
  const salaryExpectationEnabled = String(formData.get('autofill_salaryExpectationEnabled') ?? '') === 'yes';
  const salaryExpectationAmount = salaryExpectationEnabled
    ? String(formData.get('autofill_salaryExpectationAmount') ?? '').trim()
    : '';
  const salaryExpectationCurrency = salaryExpectationEnabled
    ? String(formData.get('autofill_salaryExpectationCurrency') ?? 'USD').trim() || 'USD'
    : 'USD';
  const salaryExpectationPeriod = salaryExpectationEnabled
    ? String(formData.get('autofill_salaryExpectationPeriod') ?? 'yearly')
    : '';

  return minimalAutofillProfileSchema.parse({
    workAuthorization: String(formData.get('autofill_workAuthorization') ?? '').trim(),
    workAuthorizationCountriesCsv: '',
    requiresSponsorship: String(formData.get('autofill_requiresSponsorship') ?? ''),
    requiresSponsorshipCountriesCsv: String(formData.get('autofill_requiresSponsorshipCountriesCsv') ?? '').trim(),
    clearanceStatus: String(formData.get('autofill_clearanceStatus') ?? ''),
    relocation: String(formData.get('autofill_relocation') ?? ''),
    workPreference: String(formData.get('autofill_workPreference') ?? ''),
    startDate: String(formData.get('autofill_startDate') ?? '').trim(),
    genderPronouns: String(formData.get('autofill_genderPronouns') ?? ''),
    genderPronounsCustom: String(formData.get('autofill_genderPronounsCustom') ?? '').trim(),
    raceEthnicity: String(formData.get('autofill_raceEthnicity') ?? ''),
    veteranStatus: String(formData.get('autofill_veteranStatus') ?? ''),
    disabilityStatus: String(formData.get('autofill_disabilityStatus') ?? ''),
    driversLicense: String(formData.get('autofill_driversLicense') ?? ''),
    willingToTravel: String(formData.get('autofill_willingToTravel') ?? ''),
    yearsOfExperience: String(formData.get('autofill_yearsOfExperience') ?? ''),
    highestEducation: String(formData.get('autofill_highestEducation') ?? ''),
    highestEducationSchool: String(formData.get('autofill_highestEducationSchool') ?? '').trim(),
    highestEducationProgram: String(formData.get('autofill_highestEducationProgram') ?? '').trim(),
    highestEducationDiscipline: String(formData.get('autofill_highestEducationDiscipline') ?? '').trim(),
    criminalBackground: String(formData.get('autofill_criminalBackground') ?? ''),
    noticePeriod: String(formData.get('autofill_noticePeriod') ?? ''),
    currentlyEmployed: String(formData.get('autofill_currentlyEmployed') ?? ''),
    salaryExpectations: salaryExpectationEnabled
      ? formatSalaryExpectation(
          salaryExpectationAmount,
          salaryExpectationCurrency,
          salaryExpectationPeriod
        )
      : '',
    salaryExpectationAmount,
    salaryExpectationCurrency,
    salaryExpectationPeriod,
    willingToWorkNightsWeekends: String(formData.get('autofill_willingToWorkNightsWeekends') ?? ''),
    certificationsLicenses: String(formData.get('autofill_certificationsLicenses') ?? '').trim(),
    languagesSpoken: String(formData.get('autofill_languagesSpoken') ?? '').trim(),
    knowsSomeoneAtCompany: String(formData.get('autofill_knowsSomeoneAtCompany') ?? '')
  });
}
