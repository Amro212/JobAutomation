import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const applicantProfileTable = sqliteTable('applicant_profile', {
  id: text('id').primaryKey(),
  fullName: text('full_name').notNull().default(''),
  email: text('email').notNull().default(''),
  phone: text('phone').notNull().default(''),
  location: text('location').notNull().default(''),
  summary: text('summary').notNull().default(''),
  reusableContext: text('reusable_context').notNull().default(''),
  linkedinUrl: text('linkedin_url').notNull().default(''),
  websiteUrl: text('website_url').notNull().default(''),
  baseResumeFileName: text('base_resume_file_name').notNull().default(''),
  baseResumeTex: text('base_resume_tex').notNull().default(''),
  preferredCountries: text('preferred_countries').notNull().default('[]'),
  jobKeywordProfileJson: text('job_keyword_profile_json'),
  jobKeywordProfileGeneratedAt: integer('job_keyword_profile_generated_at', { mode: 'timestamp_ms' }),
  /** Minimal autofill profile JSON (SQLite column: application_screening_json). */
  autofillProfileJson: text('application_screening_json').notNull().default('{}'),
  /** Extended profile JSON with education, experience, skills, demographic, legal fields. */
  extendedProfileJson: text('extended_profile_json').notNull().default('null'),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});
