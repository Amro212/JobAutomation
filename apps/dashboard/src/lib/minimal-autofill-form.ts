import { minimalAutofillProfileSchema, type MinimalAutofillProfile } from '@jobautomation/core';

export function parseMinimalAutofillFormData(formData: FormData): MinimalAutofillProfile {
  return minimalAutofillProfileSchema.parse({
    workAuthorization: String(formData.get('autofill_workAuthorization') ?? '').trim(),
    workAuthorizationCountriesCsv: String(formData.get('autofill_workAuthorizationCountriesCsv') ?? '').trim(),
    requiresSponsorship: String(formData.get('autofill_requiresSponsorship') ?? ''),
    clearanceStatus: String(formData.get('autofill_clearanceStatus') ?? ''),
    relocation: String(formData.get('autofill_relocation') ?? ''),
    workPreference: String(formData.get('autofill_workPreference') ?? ''),
    startDate: String(formData.get('autofill_startDate') ?? '').trim()
  });
}
