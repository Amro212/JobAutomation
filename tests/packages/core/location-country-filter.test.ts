import { describe, expect, test } from 'vitest';

import {
  buildLocationLikePatterns,
  getCountrySearchTokens,
  FILTER_COUNTRIES
} from '../../../packages/core/src/location-country-filter';

describe('location-country-filter', () => {
  describe('FILTER_COUNTRIES', () => {
    test('has unique two-letter ISO codes', () => {
      const codes = FILTER_COUNTRIES.map((c) => c.code);
      expect(new Set(codes).size).toBe(codes.length);
      for (const code of codes) {
        expect(code).toMatch(/^[A-Z]{2}$/);
      }
    });
  });

  describe('getCountrySearchTokens', () => {
    test('returns aliases for US regardless of input case', () => {
      const tokens = getCountrySearchTokens('us');
      expect(tokens).toContain('united states');
      expect(tokens).toContain('usa');
      expect(tokens).toContain('united states of america');
      expect(tokens).toContain('america');
    });

    test('US tokens include state names', () => {
      const tokens = getCountrySearchTokens('US');
      expect(tokens).toContain('california');
      expect(tokens).toContain('new york');
      expect(tokens).toContain('texas');
    });

    test('US tokens include major city names', () => {
      const tokens = getCountrySearchTokens('US');
      expect(tokens).toContain('san francisco');
      expect(tokens).toContain('chicago');
      expect(tokens).toContain('seattle');
    });

    test('CA tokens include country aliases and provinces', () => {
      const tokens = getCountrySearchTokens('CA');
      expect(tokens).toContain('canada');
      expect(tokens).toContain('ontario');
      expect(tokens).toContain('british columbia');
      expect(tokens).toContain('toronto');
    });

    test('GB tokens include subdivisions', () => {
      const tokens = getCountrySearchTokens('GB');
      expect(tokens).toContain('united kingdom');
      expect(tokens).toContain('london');
      expect(tokens).toContain('manchester');
    });

    test('AU tokens include subdivisions', () => {
      const tokens = getCountrySearchTokens('AU');
      expect(tokens).toContain('australia');
      expect(tokens).toContain('sydney');
      expect(tokens).toContain('new south wales');
    });

    test('all tokens are lowercase', () => {
      for (const entry of FILTER_COUNTRIES) {
        const tokens = getCountrySearchTokens(entry.code);
        for (const token of tokens) {
          expect(token).toBe(token.toLowerCase());
        }
      }
    });
  });

  describe('buildLocationLikePatterns', () => {
    test('wraps each token in % wildcards', () => {
      const patterns = buildLocationLikePatterns(['DE']);
      expect(patterns.length).toBeGreaterThan(0);
      for (const p of patterns) {
        expect(p).toMatch(/^%.*%$/);
      }
    });

    test('combines tokens from multiple country codes', () => {
      const patterns = buildLocationLikePatterns(['CA', 'US']);
      expect(patterns).toContain('%canada%');
      expect(patterns).toContain('%united states%');
      expect(patterns).toContain('%california%');
      expect(patterns).toContain('%toronto%');
    });

    test('returns empty array for empty input', () => {
      expect(buildLocationLikePatterns([])).toEqual([]);
    });
  });
});
