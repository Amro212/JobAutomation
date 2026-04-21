import { afterEach, describe, expect, test } from 'vitest';

import { evaluateAuthorizedDomainPolicy } from '../../../packages/automation/src/playwright/authorized-domain-policy';

describe('authorized domain policy', () => {
  afterEach(() => {
    delete process.env.JOBAUTOMATION_AUTHORIZED_DOMAIN_ALLOWLIST;
    delete process.env.JOBAUTOMATION_AUTHORIZED_DOMAIN_STRICT;
  });

  test('allows all targets when allowlist is empty and strict mode is disabled', () => {
    const decision = evaluateAuthorizedDomainPolicy('https://example.com/jobs/123');

    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('scope_allowed');
  });

  test('rejects all targets when strict mode is enabled without an allowlist', () => {
    process.env.JOBAUTOMATION_AUTHORIZED_DOMAIN_STRICT = '1';

    const decision = evaluateAuthorizedDomainPolicy('https://example.com/jobs/123');

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('allowlist_missing');
  });

  test('accepts exact and subdomain matches from allowlist', () => {
    process.env.JOBAUTOMATION_AUTHORIZED_DOMAIN_ALLOWLIST = 'example.com,*.careers.example.org';

    expect(evaluateAuthorizedDomainPolicy('https://example.com/jobs/123').allowed).toBe(true);
    expect(evaluateAuthorizedDomainPolicy('https://jobs.example.com/role').allowed).toBe(true);
    expect(evaluateAuthorizedDomainPolicy('https://eu.careers.example.org/openings').allowed).toBe(
      true
    );
  });

  test('rejects hostnames outside allowlist rules', () => {
    process.env.JOBAUTOMATION_AUTHORIZED_DOMAIN_ALLOWLIST = 'example.com';

    const decision = evaluateAuthorizedDomainPolicy('https://another-example.com/jobs/123');

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('domain_not_authorized');
  });
});
