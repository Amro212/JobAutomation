import { describe, expect, test } from 'vitest';

import { parseAutopilotSettingsFormData } from '../../../apps/dashboard/src/lib/autopilot-settings-form';

describe('autopilot settings form parser', () => {
  test('treats all enabled sources as the default source scope', () => {
    const formData = new FormData();
    formData.set('sourceScope', 'all');
    formData.set('applySiteKey', 'greenhouse');
    formData.set('discoveryCacheHours', '12');
    formData.set('artifactMode', 'both');

    const parsed = parseAutopilotSettingsFormData(formData);

    expect(parsed.discoverySourceIds).toEqual([]);
    expect(parsed.applySiteKeys).toEqual(['greenhouse']);
  });

  test('keeps explicit source ids when source scope is custom', () => {
    const formData = new FormData();
    formData.set('sourceScope', 'custom');
    formData.append('discoverySourceId', 'source-1');
    formData.append('discoverySourceId', 'source-2');
    formData.append('applySiteKey', 'greenhouse');
    formData.append('applySiteKey', 'lever');
    formData.set('maxJobsPerRun', '25');
    formData.set('matchProfile', 'me');
    formData.set('discoveryCacheHours', '6');
    formData.set('artifactMode', 'resume');
    formData.set('forceFreshDiscovery', 'on');

    const parsed = parseAutopilotSettingsFormData(formData);

    expect(parsed).toMatchObject({
      discoverySourceIds: ['source-1', 'source-2'],
      applySiteKeys: ['greenhouse', 'lever'],
      maxJobsPerRun: 25,
      matchProfile: 'me',
      forceFreshDiscovery: true,
      discoveryCacheHours: 6,
      artifactMode: 'resume',
    });
  });
});
