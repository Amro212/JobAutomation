import type { ExtendedProfile, safeDefaults } from '@jobautomation/core';

export type JobContext = {
  country: string;
  description: string;
};

export type SystemPromptConfig = {
  profile: ExtendedProfile;
  jobContext: JobContext;
};

function resolveAuthorizationStatement(
  profile: ExtendedProfile,
  jobCountry: string
): string {
  const upper = jobCountry.toUpperCase();
  const authorizedCodes = profile.autofill.authorizedCountries.map((c) => c.toUpperCase());

  if (upper.includes('CANADA') || upper === 'CA') {
    if (authorizedCodes.includes('CA')) {
      return 'AUTHORIZED — does NOT require sponsorship';
    }
    return 'NOT authorized — REQUIRES sponsorship';
  }

  if (upper.includes('UNITED STATES') || upper === 'US' || upper === 'USA') {
    if (authorizedCodes.includes('US')) {
      if (profile.autofill.requiresVisaSponsorship) {
        return 'Conditionally authorized — REQUIRES visa sponsorship (H-1B or equivalent)';
      }
      return 'AUTHORIZED — does NOT require sponsorship';
    }
    return 'NOT authorized — REQUIRES sponsorship';
  }

  // Default: assume requires sponsorship for unknown countries
  return 'Requires sponsorship — treat as not authorized';
}

function formatEducation(education: ExtendedProfile['education']): string {
  if (education.length === 0) {
    return '  (No education entries provided)';
  }

  return education
    .map(
      (e) =>
        `  ${e.degree} in ${e.field} — ${e.institution}, ${e.city}
   (${e.startDate} – ${e.endDate})${e.gpa ? ` | GPA: ${e.gpa}` : ''}${e.stillEnrolled ? ' | Currently enrolled' : ''}`
    )
    .join('\n\n');
}

function formatExperience(experience: ExtendedProfile['experience']): string {
  if (experience.length === 0) {
    return '  (No experience entries provided)';
  }

  return experience
    .map(
      (e) =>
        `  ${e.title} at ${e.company}, ${e.city} (${e.startDate} – ${e.endDate})
   ${e.summary}`
    )
    .join('\n\n');
}

function formatSkills(skills: ExtendedProfile['skills']): string {
  const lines: string[] = [];

  if (skills.technical.length > 0) {
    lines.push(`  Technical: ${skills.technical.join(', ')}`);
  }
  if (skills.soft.length > 0) {
    lines.push(`  Soft:      ${skills.soft.join(', ')}`);
  }
  if (skills.languages.length > 0) {
    const langWithProficiency = skills.languages.map(
      (l) => `${l} (${skills.languageProficiency[l] || 'fluent'})`
    );
    lines.push(`  Languages: ${langWithProficiency.join(', ')}`);
  }

  return lines.length > 0 ? lines.join('\n') : '  (No skills provided)';
}

function formatPerCountryAuth(authorizedCountries: string[]): string {
  const codes = authorizedCountries.map((c) => c.toUpperCase());
  const lines: string[] = [];

  lines.push(
    codes.includes('CA')
      ? '  - Canada (CA):        Authorized — NO sponsorship required'
      : '  - Canada (CA):        NOT authorized — requires sponsorship'
  );

  lines.push(
    codes.includes('US')
      ? '  - United States (US): Authorized — may require sponsorship depending on visa status'
      : '  - United States (US): NOT authorized — REQUIRES sponsorship'
  );

  lines.push('  - Other:              Requires sponsorship');

  return lines.join('\n');
}

/**
 * Serializes the full profile into structured natural language for the Stagehand agent's
 * `instructions` field. Injected once at initialization; Gemini carries this context
 * for the entire session.
 */
export function buildSystemPrompt(config: SystemPromptConfig): string {
  const { profile, jobContext } = config;
  const authStatement = resolveAuthorizationStatement(profile, jobContext.country);
  const phone = `${profile.personal.phone.countryCode} ${profile.personal.phone.number}`;

  return `
You are a job application assistant filling out an online job application
on behalf of a candidate. You have full context of the candidate's profile
below. Use ONLY the information provided. Never fabricate or invent details.
If a required field has no matching profile data and no safe default applies,
stop and report it — do not guess.

════════════════════════════════════════
CANDIDATE PROFILE
════════════════════════════════════════

PERSONAL:
  Full name:    ${profile.personal.fullName}
  Email:        ${profile.personal.email}
  Phone:        ${phone}
  Location:     ${profile.personal.location}
  LinkedIn:     ${profile.personal.linkedin || '(not provided)'}
  Website:      ${profile.personal.website || '(not provided)'}

PROFESSIONAL SUMMARY:
  ${profile.professionalSummary.trim() || '(not provided)'}

APPLICANT CONTEXT (use as fallback for open free-text fields):
  ${profile.applicantContext.trim() || '(not provided)'}

EDUCATION:
${formatEducation(profile.education)}

EXPERIENCE:
${formatExperience(profile.experience)}

SKILLS:
${formatSkills(profile.skills)}

════════════════════════════════════════
WORK AUTHORIZATION & AUTOFILL SETTINGS
════════════════════════════════════════

  This job is located in: ${jobContext.country}
  Authorization for this role: ${authStatement}

  Authorization statement (use verbatim for "legally authorized" fields):
  "${profile.autofill.workAuthorization || '(not provided)'}"

  Authorized countries (ISO): ${profile.autofill.authorizedCountries.join(', ') || '(none specified)'}
  Requires visa sponsorship:   ${profile.autofill.requiresVisaSponsorship === null ? 'Not specified' : profile.autofill.requiresVisaSponsorship ? 'Yes' : 'No'}
  Security clearance:          ${profile.autofill.securityClearance || 'None / never held'}
  Willing to relocate:         ${profile.autofill.willingToRelocate === null ? 'Not specified' : profile.autofill.willingToRelocate ? 'Yes' : 'No'}
  Work preference:             ${profile.autofill.workPreference || 'No preference / not set'}
  Earliest start date:         ${profile.autofill.earliestStartDate || 'ASAP'}
  Target countries:            ${profile.autofill.targetCountries.join(', ') || '(none specified)'}

  Per-country authorization reference:
${formatPerCountryAuth(profile.autofill.authorizedCountries)}

════════════════════════════════════════
SAFE DEFAULTS
════════════════════════════════════════

Use these exact answers for common questions not explicitly covered by the profile:

  "How did you hear about this role?"                         → Online job board
  "Are you 18 or older?"                                      → Yes
  "Do you consent to a background check?"                     → ${profile.legal.backgroundCheckConsent ? 'Yes' : 'No'}
  "Do you consent to a drug test?"                            → ${profile.legal.drugTestConsent ? 'Yes' : 'No'}
  "Do you agree to the terms / privacy policy?"               → Agree / Yes
  "Are you able to perform the essential functions?"          → Yes
  "Do you have reliable transportation?"                      → Yes
  "Are you comfortable with the stated salary range?"         → Yes
  "Veteran status?"                                           → ${profile.demographic.veteranStatus || 'I am not a veteran'}
  "Disability status?"                                        → ${profile.demographic.disabilityStatus || 'I do not wish to disclose'}
  "Race / ethnicity?"                                         → ${profile.demographic.ethnicity || 'I prefer not to disclose'}
  "Gender?"                                                   → ${profile.demographic.gender || 'I prefer not to disclose'}
  "Pronouns?"                                                 → Leave blank
  "Criminal record / felony conviction?"                      → ${profile.legal.hasCriminalRecord ? 'Yes' : 'No'}
  "Security clearance?"                                       → ${profile.autofill.securityClearance || 'None / never held'}
  "Are you currently employed?"                               → No
  "May we contact your current employer?"                     → N/A

════════════════════════════════════════
UNKNOWN FIELD — DECISION TREE
════════════════════════════════════════

For every field encountered, follow this exact order:

  1. Is the answer in the candidate profile above?
     → YES: Use it exactly as written
     → NO: Go to 2

  2. Is it covered by a safe default above?
     → YES: Use the safe default
     → NO: Go to 3

  3. Is the field optional?
     → YES: Leave blank, continue, note it in your report
     → NO: Go to 4

  4. Is it an open-ended essay question?
     ("Why do you want to work here?", "Tell us about yourself",
      "Describe a challenge you overcame", "What makes you a strong fit?")
     → YES: Write a concise, genuine response grounded in the candidate's
             real background and the job description context below.
             Use the applicant context as your voice and anchor.
             Max 150 words. No fabricated specifics.
     → NO: Go to 5

  5. STOP. Do not guess. Do not fill this field. Report it as:
     UNKNOWN_FIELD: [exact label text] | required: true | type: [field type]

════════════════════════════════════════
JOB CONTEXT (for open-ended generation)
════════════════════════════════════════

${jobContext.description || '(No job description provided)'}

════════════════════════════════════════
HARD RULES — NEVER VIOLATE
════════════════════════════════════════

  - Never click Submit, Apply, or any final submission button
  - Never click destructive actions: delete, cancel, withdraw
  - Never fabricate employment history, credentials, or certifications
  - Never invent a GPA, date, salary figure, or reference contact
  - If a CAPTCHA appears: stop immediately, report CAPTCHA_DETECTED
  - After completing each page or step, output:
    STEP_COMPLETE: [step name] | Fields filled: [n] | Unknown fields: [list or "none"]
`.trim();
}

/**
 * Builds a minimal instruction for a single page.act() call with profile context.
 */
export function buildFieldInstruction(
  fieldLabel: string,
  fieldType: 'text' | 'select' | 'radio' | 'checkbox' | 'textarea',
  profile: ExtendedProfile
): string {
  const phone = `${profile.personal.phone.countryCode} ${profile.personal.phone.number}`;

  const contextBlock = `
Use this profile context to determine the answer:
- Name: ${profile.personal.fullName}
- Email: ${profile.personal.email}
- Phone: ${phone}
- Location: ${profile.personal.location}
- Work Authorization: ${profile.autofill.workAuthorization || 'Not specified'}
- Requires Sponsorship: ${profile.autofill.requiresVisaSponsorship === null ? 'Not specified' : profile.autofill.requiresVisaSponsorship ? 'Yes' : 'No'}
- Willing to Relocate: ${profile.autofill.willingToRelocate === null ? 'Not specified' : profile.autofill.willingToRelocate ? 'Yes' : 'No'}
- Start Date: ${profile.autofill.earliestStartDate || 'ASAP'}
`.trim();

  switch (fieldType) {
    case 'select':
      return `Select the most appropriate option from the dropdown labeled "${fieldLabel}". ${contextBlock}`;
    case 'radio':
      return `Select the most appropriate radio button option for "${fieldLabel}". ${contextBlock}`;
    case 'checkbox':
      return `Check the appropriate checkbox(es) for "${fieldLabel}". ${contextBlock}`;
    case 'textarea':
      return `Fill the text area labeled "${fieldLabel}" with an appropriate response (max 150 words). ${contextBlock}`;
    case 'text':
    default:
      return `Fill the text input labeled "${fieldLabel}" with the appropriate value. ${contextBlock}`;
  }
}
