import { applicantProfileInputSchema, applicantProfileSchema, type ApplicantProfile, type ApplicantProfileInput } from '@jobautomation/core';

import type { JobAutomationDatabase } from '../client';
import { applicantProfileTable } from '../schema';

const DEFAULT_PROFILE_ID = 'default';

function mapApplicantProfile(record: typeof applicantProfileTable.$inferSelect): ApplicantProfile {
  return applicantProfileSchema.parse(record);
}

export class ApplicantProfileRepository {
  constructor(private readonly db: JobAutomationDatabase) {}

  async get(): Promise<ApplicantProfile | null> {
    const record = await this.db.query.applicantProfileTable.findFirst();
    return record ? mapApplicantProfile(record) : null;
  }

  async save(input: ApplicantProfileInput): Promise<ApplicantProfile> {
    const parsed = applicantProfileInputSchema.parse(input);
    const record = {
      ...parsed,
      id: parsed.id || DEFAULT_PROFILE_ID,
      updatedAt: new Date()
    };

    await this.db
      .insert(applicantProfileTable)
      .values(record)
      .onConflictDoUpdate({
        target: applicantProfileTable.id,
        set: {
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
          updatedAt: record.updatedAt
        }
      });

    return applicantProfileSchema.parse(record);
  }
}
