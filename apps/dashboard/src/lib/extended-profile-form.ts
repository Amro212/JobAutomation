import {
  extendedProfileSchema,
  type ExtendedProfile,
  type EducationEntry,
  type ExperienceEntry,
  type SkillsProfile,
  type DemographicProfile,
  type LegalProfile
} from '@jobautomation/core';

function parseEducationFromFormData(formData: FormData): EducationEntry[] {
  const entries: EducationEntry[] = [];
  let index = 0;

  while (formData.has(`education[${index}][degree]`)) {
    const degree = String(formData.get(`education[${index}][degree]`) ?? '');
    const field = String(formData.get(`education[${index}][field]`) ?? '');
    const institution = String(formData.get(`education[${index}][institution]`) ?? '');

    // Only include entries with required fields
    if (degree.trim() && field.trim() && institution.trim()) {
      entries.push({
        degree: degree.trim(),
        field: field.trim(),
        institution: institution.trim(),
        city: String(formData.get(`education[${index}][city]`) ?? ''),
        country: String(formData.get(`education[${index}][country]`) ?? ''),
        startDate: String(formData.get(`education[${index}][startDate]`) ?? ''),
        endDate: String(formData.get(`education[${index}][endDate]`) ?? ''),
        gpa: String(formData.get(`education[${index}][gpa]`) ?? ''),
        stillEnrolled: formData.get(`education[${index}][stillEnrolled]`) === 'true'
      });
    }

    index++;
  }

  return entries;
}

function parseExperienceFromFormData(formData: FormData): ExperienceEntry[] {
  const entries: ExperienceEntry[] = [];
  let index = 0;

  while (formData.has(`experience[${index}][title]`)) {
    const title = String(formData.get(`experience[${index}][title]`) ?? '');
    const company = String(formData.get(`experience[${index}][company]`) ?? '');

    // Only include entries with required fields
    if (title.trim() && company.trim()) {
      entries.push({
        title: title.trim(),
        company: company.trim(),
        city: String(formData.get(`experience[${index}][city]`) ?? ''),
        country: String(formData.get(`experience[${index}][country]`) ?? ''),
        startDate: String(formData.get(`experience[${index}][startDate]`) ?? ''),
        endDate: String(formData.get(`experience[${index}][endDate]`) ?? ''),
        current: formData.get(`experience[${index}][current]`) === 'true',
        summary: String(formData.get(`experience[${index}][summary]`) ?? '')
      });
    }

    index++;
  }

  return entries;
}

function parseSkillsFromFormData(formData: FormData): SkillsProfile {
  const technical = formData.getAll('skills[technical][]').filter((v): v is string => typeof v === 'string');
  const soft = formData.getAll('skills[soft][]').filter((v): v is string => typeof v === 'string');
  const languages = formData.getAll('skills[languages][]').filter((v): v is string => typeof v === 'string');

  const languageProficiency: Record<string, string> = {};
  for (const lang of languages) {
    const proficiency = formData.get(`skills[languageProficiency][${lang}]`);
    if (typeof proficiency === 'string') {
      languageProficiency[lang] = proficiency;
    }
  }

  return {
    technical,
    soft,
    languages,
    languageProficiency
  };
}

function parseDemographicFromFormData(formData: FormData): DemographicProfile {
  const veteranStatus = String(formData.get('demographic[veteranStatus]') ?? '');
  const disabilityStatus = String(formData.get('demographic[disabilityStatus]') ?? '');
  const ethnicity = String(formData.get('demographic[ethnicity]') ?? '');
  const gender = String(formData.get('demographic[gender]') ?? '');

  return {
    veteranStatus: veteranStatus as DemographicProfile['veteranStatus'],
    disabilityStatus: disabilityStatus as DemographicProfile['disabilityStatus'],
    ethnicity: ethnicity as DemographicProfile['ethnicity'],
    gender: gender as DemographicProfile['gender']
  };
}

function parseLegalFromFormData(formData: FormData): LegalProfile {
  return {
    backgroundCheckConsent: formData.get('legal[backgroundCheckConsent]') === 'true',
    drugTestConsent: formData.get('legal[drugTestConsent]') === 'true',
    over18: formData.get('legal[over18]') === 'true',
    hasCriminalRecord: formData.get('legal[hasCriminalRecord]') === 'true'
  };
}

export function parseExtendedProfileFromFormData(formData: FormData): ExtendedProfile | null {
  const education = parseEducationFromFormData(formData);
  const experience = parseExperienceFromFormData(formData);
  const skills = parseSkillsFromFormData(formData);
  const demographic = parseDemographicFromFormData(formData);
  const legal = parseLegalFromFormData(formData);

  // Get personal info from the main form
  const fullName = String(formData.get('fullName') ?? '');
  const email = String(formData.get('email') ?? '');
  const phone = String(formData.get('phone') ?? '');
  const location = String(formData.get('location') ?? '');
  const linkedinUrl = String(formData.get('linkedinUrl') ?? '');
  const websiteUrl = String(formData.get('websiteUrl') ?? '');

  // Get textareas
  const professionalSummary = String(formData.get('summary') ?? '');
  const applicantContext = String(formData.get('reusableContext') ?? '');

  // Check if we have any extended data to save
  const hasExtendedData =
    education.length > 0 ||
    experience.length > 0 ||
    skills.technical.length > 0 ||
    skills.soft.length > 0 ||
    skills.languages.length > 0 ||
    demographic.veteranStatus !== '' ||
    demographic.disabilityStatus !== '' ||
    demographic.ethnicity !== '' ||
    demographic.gender !== '';

  if (!hasExtendedData && !fullName && !email) {
    // No extended profile data at all
    return null;
  }

  // Parse phone into country code and number
  const phoneMatch = phone.match(/^(\+\d{1,3})\s*(.*)$/);
  const phoneObj = phoneMatch
    ? { countryCode: phoneMatch[1], number: phoneMatch[2] }
    : { countryCode: '+1', number: phone };

  try {
    return extendedProfileSchema.parse({
      personal: {
        fullName: fullName || 'Placeholder Name',
        email: email || 'placeholder@example.com',
        phone: phoneObj,
        location,
        linkedin: linkedinUrl,
        website: websiteUrl
      },
      professionalSummary,
      applicantContext,
      autofill: {}, // Use defaults from schema
      education,
      experience,
      skills,
      documents: {},
      demographic,
      legal
    });
  } catch {
    // If validation fails, return null
    return null;
  }
}
