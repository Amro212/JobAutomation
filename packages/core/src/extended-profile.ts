import { z } from 'zod';

/**
 * Extended profile schema for full job application automation.
 * Maps directly to the Setup UI (Batch A) fields plus extended fields for agent context.
 */

// ── EDUCATION ────────────────────────────────────────────────────────────────

export const educationEntrySchema = z.object({
  degree: z.string().min(1),
  field: z.string().min(1),
  institution: z.string().min(1),
  city: z.string().default(''),
  country: z.string().default(''),
  startDate: z.string().default(''),
  endDate: z.string().default(''),
  gpa: z.string().default(''),
  stillEnrolled: z.boolean().default(false)
});

export type EducationEntry = z.infer<typeof educationEntrySchema>;

// ── EXPERIENCE ───────────────────────────────────────────────────────────────

export const experienceEntrySchema = z.object({
  title: z.string().min(1),
  company: z.string().min(1),
  city: z.string().default(''),
  country: z.string().default(''),
  startDate: z.string().default(''),
  endDate: z.string().default(''),
  current: z.boolean().default(false),
  summary: z.string().default('')
});

export type ExperienceEntry = z.infer<typeof experienceEntrySchema>;

// ── SKILLS ───────────────────────────────────────────────────────────────────

export const skillsProfileSchema = z.object({
  technical: z.array(z.string()).default([]),
  soft: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
  languageProficiency: z.record(z.string(), z.string()).default({})
});

export type SkillsProfile = z.infer<typeof skillsProfileSchema>;

// ── DOCUMENTS ────────────────────────────────────────────────────────────────

export const documentsProfileSchema = z.object({
  resumePath: z.string().default(''),
  coverLetterPath: z.string().default('')
});

export type DocumentsProfile = z.infer<typeof documentsProfileSchema>;

// ── DEMOGRAPHIC (voluntary self-identification) ──────────────────────────────

export const demographicProfileSchema = z.object({
  veteranStatus: z.enum(['', 'not a veteran', 'veteran', 'prefer not to disclose']).default(''),
  disabilityStatus: z.enum(['', 'no disability', 'has disability', 'prefer not to disclose']).default(''),
  ethnicity: z.enum(['', 'prefer not to disclose', 'hispanic', 'white', 'black', 'asian', 'native american', 'pacific islander', 'two or more races']).default(''),
  gender: z.enum(['', 'prefer not to disclose', 'male', 'female', 'non-binary', 'other']).default('')
});

export type DemographicProfile = z.infer<typeof demographicProfileSchema>;

// ── LEGAL CONSENTS ───────────────────────────────────────────────────────────

export const legalProfileSchema = z.object({
  backgroundCheckConsent: z.boolean().default(true),
  drugTestConsent: z.boolean().default(true),
  over18: z.boolean().default(true),
  hasCriminalRecord: z.boolean().default(false)
});

export type LegalProfile = z.infer<typeof legalProfileSchema>;

// ── PHONE WITH COUNTRY CODE ──────────────────────────────────────────────────

export const phoneWithCountryCodeSchema = z.object({
  countryCode: z.string().default('+1'),
  number: z.string().default('')
});

export type PhoneWithCountryCode = z.infer<typeof phoneWithCountryCodeSchema>;

// ── EXTENDED AUTOFILL ────────────────────────────────────────────────────────

export const extendedAutofillSchema = z.object({
  targetCountries: z.array(z.string()).default([]),
  baseResumeFileName: z.string().default(''),
  workAuthorization: z.string().default(''),
  authorizedCountries: z.array(z.string().length(2)).default([]),
  requiresVisaSponsorship: z.boolean().nullable().default(null),
  securityClearance: z.enum(['', 'None / never held', 'Secret', 'Top Secret', 'TS/SCI']).default(''),
  willingToRelocate: z.boolean().nullable().default(null),
  workPreference: z.enum(['', 'remote', 'hybrid', 'onsite']).default(''),
  earliestStartDate: z.string().default('ASAP')
});

export type ExtendedAutofill = z.infer<typeof extendedAutofillSchema>;

// ── FULL EXTENDED PROFILE ────────────────────────────────────────────────────

export const extendedProfileSchema = z.object({
  // Personal (from Setup UI)
  personal: z.object({
    fullName: z.string().min(1),
    email: z.string().email(),
    phone: phoneWithCountryCodeSchema,
    location: z.string().default(''),
    linkedin: z.string().default(''),
    website: z.string().default('')
  }),

  // Text areas
  professionalSummary: z.string().default(''),
  applicantContext: z.string().default(''),

  // Autofill settings
  autofill: extendedAutofillSchema,

  // Extended arrays
  education: z.array(educationEntrySchema).default([]),
  experience: z.array(experienceEntrySchema).default([]),
  skills: skillsProfileSchema.default({}),
  documents: documentsProfileSchema.default({}),
  demographic: demographicProfileSchema.default({}),
  legal: legalProfileSchema.default({})
});

export type ExtendedProfile = z.infer<typeof extendedProfileSchema>;

// ── DEFAULT PROFILE ──────────────────────────────────────────────────────────

export const defaultExtendedProfile: ExtendedProfile = extendedProfileSchema.parse({
  personal: {
    fullName: 'Placeholder Name',
    email: 'placeholder@example.com',
    phone: { countryCode: '+1', number: '' },
    location: '',
    linkedin: '',
    website: ''
  },
  professionalSummary: '',
  applicantContext: '',
  autofill: {},
  education: [],
  experience: [],
  skills: {},
  documents: {},
  demographic: {},
  legal: {}
});

// ── SAFE DEFAULTS FOR COMMON QUESTIONS ───────────────────────────────────────

export const safeDefaults = {
  howDidYouHear: 'Online job board',
  over18: 'Yes',
  backgroundCheckConsent: 'Yes',
  drugTestConsent: 'Yes',
  termsAgreement: 'Yes',
  essentialFunctions: 'Yes',
  reliableTransportation: 'Yes',
  comfortableWithSalary: 'Yes',
  veteranStatus: 'I am not a veteran',
  disabilityStatus: 'I do not wish to disclose',
  ethnicity: 'I prefer not to disclose',
  gender: 'I prefer not to disclose',
  pronouns: '',
  criminalRecord: 'No',
  securityClearance: 'None / never held',
  currentlyEmployed: 'No',
  contactCurrentEmployer: 'N/A'
} as const;

export type SafeDefaults = typeof safeDefaults;
