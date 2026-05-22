import { describe, expect, test } from 'vitest';

import {
  formatLocalDateTime,
  parseDateInput,
  toDateIsoString
} from '../../../apps/dashboard/src/lib/format-local-datetime';

describe('formatLocalDateTime', () => {
  test('parses ISO strings from API payloads', () => {
    const parsed = parseDateInput('2026-05-22T03:24:23.937Z');
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed?.getTime()).toBe(Date.parse('2026-05-22T03:24:23.937Z'));
  });

  test('formats timestamps without raw UTC suffixes', () => {
    const formatted = formatLocalDateTime('2026-05-22T03:24:23.937Z');
    expect(formatted).not.toMatch(/T\d{2}:\d{2}.*Z$/);
    expect(formatted.length).toBeGreaterThan(0);
  });

  test('preserves canonical ISO for machine-readable attributes', () => {
    expect(toDateIsoString('2026-05-22T03:24:23.937Z')).toBe('2026-05-22T03:24:23.937Z');
  });
});
