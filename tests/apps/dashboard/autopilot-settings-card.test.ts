import { describe, expect, test } from 'vitest';

import { sourceIdsForApplySites } from '../../../apps/dashboard/src/lib/autopilot-settings-form';
import type { DiscoverySourceRecord } from '../../../packages/core/src';

function source(
  id: string,
  sourceKind: DiscoverySourceRecord['sourceKind']
): DiscoverySourceRecord {
  return {
    id,
    sourceKind,
    sourceKey: `${id}-key`,
    label: id,
    enabled: true,
    createdAt: new Date('2026-05-20T00:00:00.000Z'),
    updatedAt: new Date('2026-05-20T00:00:00.000Z')
  };
}

describe('autopilot settings source selection', () => {
  const sources = [
    source('greenhouse-1', 'greenhouse'),
    source('greenhouse-2', 'greenhouse'),
    source('lever-1', 'lever'),
    source('ashby-1', 'ashby'),
    source('fallback-1', 'playwright')
  ];

  test('selects only greenhouse source ids for the greenhouse apply site', () => {
    expect(sourceIdsForApplySites(sources, ['greenhouse'])).toEqual([
      'greenhouse-1',
      'greenhouse-2'
    ]);
  });

  test('selects source ids for all selected structured apply sites', () => {
    expect(sourceIdsForApplySites(sources, ['greenhouse', 'lever'])).toEqual([
      'greenhouse-1',
      'greenhouse-2',
      'lever-1'
    ]);
  });

  test('excludes fallback sources because they have no apply site', () => {
    expect(
      sourceIdsForApplySites(sources, ['greenhouse', 'lever', 'ashby'])
    ).toEqual(['greenhouse-1', 'greenhouse-2', 'lever-1', 'ashby-1']);
  });

  test('returns no source ids when no apply sites are selected', () => {
    expect(sourceIdsForApplySites(sources, [])).toEqual([]);
  });
});
