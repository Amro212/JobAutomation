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
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});
