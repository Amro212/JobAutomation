import {
  applicantProfileInputSchema,
  applicantProfileSchema,
  jobKeywordProfileSchema,
  type ApplicantProfile,
  type ApplicantProfileInput,
  type JobKeywordProfile
} from '@jobautomation/core';
import { eq } from 'drizzle-orm';

import type { JobAutomationDatabase } from '../client';
import { applicantProfileTable } from '../schema';

const DEFAULT_PROFILE_ID = 'default';

function parseCountriesJson(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function parseJobKeywordProfileJson(raw: string | null | undefined): JobKeywordProfile | null {
  if (raw == null || raw.trim() === '') {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const result = jobKeywordProfileSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function mapApplicantProfile(record: typeof applicantProfileTable.$inferSelect): ApplicantProfile {
  return applicantProfileSchema.parse({
    id: record.id,
    fullName: record.fullName,
    email: record.email,
    phone: record.phone,
    location: record.location,
    summary: record.summary,
    reusableContext: record.reusableContext,
    linkedinUrl: record.linkedinUrl,
    websiteUrl: record.websiteUrl,
    baseResumeFileName: record.baseResumeFileName,
    baseResumeTex: record.baseResumeTex,
    preferredCountries: parseCountriesJson(record.preferredCountries),
    jobKeywordProfile: parseJobKeywordProfileJson(record.jobKeywordProfileJson),
    jobKeywordProfileGeneratedAt: record.jobKeywordProfileGeneratedAt ?? null,
    updatedAt: record.updatedAt
  });
}

export class ApplicantProfileRepository {
  constructor(private readonly db: JobAutomationDatabase) {}

  async get(): Promise<ApplicantProfile | null> {
    const record = await this.db.query.applicantProfileTable.findFirst();
    return record ? mapApplicantProfile(record) : null;
  }

  async save(input: ApplicantProfileInput): Promise<ApplicantProfile> {
    const parsed = applicantProfileInputSchema.parse(input);
    const id = parsed.id || DEFAULT_PROFILE_ID;

    const existing = await this.db.query.applicantProfileTable.findFirst({
      where: eq(applicantProfileTable.id, id)
    });

    const mergedKeywordProfile =
      parsed.jobKeywordProfile !== undefined
        ? parsed.jobKeywordProfile
        : existing
          ? parseJobKeywordProfileJson(existing.jobKeywordProfileJson)
          : null;

    const mergedKeywordGeneratedAt =
      parsed.jobKeywordProfileGeneratedAt !== undefined
        ? parsed.jobKeywordProfileGeneratedAt
        : existing?.jobKeywordProfileGeneratedAt ?? null;

    const countriesJson = JSON.stringify(parsed.preferredCountries ?? []);
    const keywordJson = mergedKeywordProfile ? JSON.stringify(mergedKeywordProfile) : null;
    const now = new Date();

    const row = {
      id,
      fullName: parsed.fullName,
      email: parsed.email,
      phone: parsed.phone,
      location: parsed.location,
      summary: parsed.summary,
      reusableContext: parsed.reusableContext,
      linkedinUrl: parsed.linkedinUrl,
      websiteUrl: parsed.websiteUrl,
      baseResumeFileName: parsed.baseResumeFileName,
      baseResumeTex: parsed.baseResumeTex,
      preferredCountries: countriesJson,
      jobKeywordProfileJson: keywordJson,
      jobKeywordProfileGeneratedAt: mergedKeywordGeneratedAt,
      updatedAt: now
    };

    await this.db.insert(applicantProfileTable).values(row).onConflictDoUpdate({
      target: applicantProfileTable.id,
      set: {
        fullName: row.fullName,
        email: row.email,
        phone: row.phone,
        location: row.location,
        summary: row.summary,
        reusableContext: row.reusableContext,
        linkedinUrl: row.linkedinUrl,
        websiteUrl: row.websiteUrl,
        baseResumeFileName: row.baseResumeFileName,
        baseResumeTex: row.baseResumeTex,
        preferredCountries: row.preferredCountries,
        jobKeywordProfileJson: row.jobKeywordProfileJson,
        jobKeywordProfileGeneratedAt: row.jobKeywordProfileGeneratedAt,
        updatedAt: row.updatedAt
      }
    });

    return applicantProfileSchema.parse({
      ...parsed,
      id,
      preferredCountries: parsed.preferredCountries ?? [],
      jobKeywordProfile: mergedKeywordProfile,
      jobKeywordProfileGeneratedAt: mergedKeywordGeneratedAt,
      updatedAt: now
    });
  }

  async saveJobKeywordProfile(profile: JobKeywordProfile): Promise<ApplicantProfile> {
    const existing = await this.get();
    if (!existing) {
      throw new Error('Cannot save job keyword profile without an applicant profile row.');
    }

    const { updatedAt: _u, ...rest } = existing;
    return this.save({
      ...rest,
      jobKeywordProfile: profile,
      jobKeywordProfileGeneratedAt: new Date()
    });
  }
}
