import { randomUUID } from 'node:crypto';

import { and, desc, eq } from 'drizzle-orm';

import {
  discoverySourceInputSchema,
  discoverySourcePatchSchema,
  discoverySourceRecordSchema,
  type DiscoverySourceInput,
  type DiscoverySourcePatch,
  type DiscoverySourceRecord
} from '@jobautomation/core';

import type { JobAutomationDatabase } from '../client';
import { discoverySourcesTable } from '../schema';

function mapDiscoverySource(record: typeof discoverySourcesTable.$inferSelect): DiscoverySourceRecord {
  return discoverySourceRecordSchema.parse(record);
}

export class DiscoverySourcesRepository {
  constructor(private readonly db: JobAutomationDatabase) {}

  async list(): Promise<DiscoverySourceRecord[]> {
    const records = await this.db
      .select()
      .from(discoverySourcesTable)
      .orderBy(desc(discoverySourcesTable.updatedAt));

    return records.map(mapDiscoverySource);
  }

  async listEnabled(): Promise<DiscoverySourceRecord[]> {
    const records = await this.db.query.discoverySourcesTable.findMany({
      where: eq(discoverySourcesTable.enabled, true)
    });

    return records.map(mapDiscoverySource);
  }

  async findById(id: string): Promise<DiscoverySourceRecord | null> {
    const record = await this.db.query.discoverySourcesTable.findFirst({
      where: eq(discoverySourcesTable.id, id)
    });

    return record ? mapDiscoverySource(record) : null;
  }

  async findByIdentity(sourceKind: string, sourceKey: string): Promise<DiscoverySourceRecord | null> {
    const record = await this.db.query.discoverySourcesTable.findFirst({
      where: and(
        eq(discoverySourcesTable.sourceKind, sourceKind),
        eq(discoverySourcesTable.sourceKey, sourceKey)
      )
    });

    return record ? mapDiscoverySource(record) : null;
  }

  async listByIds(ids: readonly string[]): Promise<DiscoverySourceRecord[]> {
    const records = await Promise.all(ids.map((id) => this.findById(id)));
    return records.filter((record): record is DiscoverySourceRecord => record !== null);
  }

  async upsert(input: DiscoverySourceInput): Promise<DiscoverySourceRecord> {
    const parsed = discoverySourceInputSchema.parse(input);
    const existing = await this.findByIdentity(parsed.sourceKind, parsed.sourceKey);
    const now = new Date();
    const record = {
      id: existing?.id ?? randomUUID(),
      sourceKind: parsed.sourceKind,
      sourceKey: parsed.sourceKey,
      label: parsed.label,
      enabled: parsed.enabled,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    await this.db
      .insert(discoverySourcesTable)
      .values(record)
      .onConflictDoUpdate({
        target: [discoverySourcesTable.sourceKind, discoverySourcesTable.sourceKey],
        set: {
          label: record.label,
          enabled: record.enabled,
          updatedAt: record.updatedAt
        }
      });

    return discoverySourceRecordSchema.parse(record);
  }

  async update(id: string, input: DiscoverySourcePatch): Promise<DiscoverySourceRecord | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const parsed = discoverySourcePatchSchema.parse(input);
    const record = {
      ...existing,
      ...parsed,
      updatedAt: new Date()
    };

    await this.db
      .update(discoverySourcesTable)
      .set({
        sourceKind: record.sourceKind,
        sourceKey: record.sourceKey,
        label: record.label,
        enabled: record.enabled,
        updatedAt: record.updatedAt
      })
      .where(eq(discoverySourcesTable.id, id));

    return discoverySourceRecordSchema.parse(record);
  }
}
