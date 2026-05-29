import { eq } from 'drizzle-orm';

import {
  autopilotConfigInputSchema,
  autopilotConfigSchema,
  autopilotSettingsRecordSchema,
  type AutopilotConfig,
  type AutopilotConfigInput,
  type AutopilotSettingsRecord
} from '@jobautomation/core';

import type { JobAutomationDatabase } from '../client';
import { autopilotSettingsTable } from '../schema';

const DEFAULT_AUTOPILOT_SETTINGS_ID = 'default';
const defaultAutopilotConfig = autopilotConfigSchema.parse({});

function parseConfigJson(value: string): AutopilotConfig {
  let parsed: unknown = {};

  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    return defaultAutopilotConfig;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return defaultAutopilotConfig;
  }

  const config = parsed as Record<string, unknown>;
  const normalized = {
    ...config,
    applySiteKeys:
      Array.isArray(config.applySiteKeys) && config.applySiteKeys.length > 0
        ? config.applySiteKeys
        : defaultAutopilotConfig.applySiteKeys
  };

  const candidate = autopilotConfigSchema.safeParse(normalized);
  return candidate.success ? candidate.data : defaultAutopilotConfig;
}

function mapAutopilotSettings(
  record: typeof autopilotSettingsTable.$inferSelect
): AutopilotSettingsRecord {
  return autopilotSettingsRecordSchema.parse({
    id: record.id,
    config: parseConfigJson(record.configJson),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  });
}

function mergeConfig(
  base: AutopilotConfig,
  patch: AutopilotConfigInput
): AutopilotConfig {
  const mergedJobFilters = patch.jobFilters
    ? {
        ...base.jobFilters,
        ...patch.jobFilters
      }
    : base.jobFilters;

  return autopilotConfigSchema.parse({
    ...base,
    ...patch,
    jobFilters: mergedJobFilters
  });
}

export class AutopilotSettingsRepository {
  constructor(private readonly db: JobAutomationDatabase) {}

  async get(): Promise<AutopilotSettingsRecord | null> {
    const record = await this.db.query.autopilotSettingsTable.findFirst({
      where: eq(autopilotSettingsTable.id, DEFAULT_AUTOPILOT_SETTINGS_ID)
    });

    return record ? mapAutopilotSettings(record) : null;
  }

  async getOrCreateDefault(): Promise<AutopilotSettingsRecord> {
    const existing = await this.get();
    if (existing) {
      return existing;
    }

    const now = new Date();
    const config = autopilotConfigSchema.parse({});
    const record = {
      id: DEFAULT_AUTOPILOT_SETTINGS_ID,
      configJson: JSON.stringify(config),
      createdAt: now,
      updatedAt: now
    };

    await this.db.insert(autopilotSettingsTable).values(record);
    return mapAutopilotSettings(record);
  }

  async upsert(input: AutopilotConfigInput): Promise<AutopilotSettingsRecord> {
    const parsed = autopilotConfigInputSchema.parse(input);
    const existing = await this.get();
    const now = new Date();
    const baseConfig = existing?.config ?? autopilotConfigSchema.parse({});
    const mergedConfig = mergeConfig(baseConfig, parsed);
    const record = {
      id: DEFAULT_AUTOPILOT_SETTINGS_ID,
      configJson: JSON.stringify(mergedConfig),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    await this.db
      .insert(autopilotSettingsTable)
      .values(record)
      .onConflictDoUpdate({
        target: autopilotSettingsTable.id,
        set: {
          configJson: record.configJson,
          updatedAt: record.updatedAt
        }
      });

    return mapAutopilotSettings(record);
  }
}
