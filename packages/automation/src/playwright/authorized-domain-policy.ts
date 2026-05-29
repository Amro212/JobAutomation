const AUTHORIZED_ALLOWLIST_ENV = 'JOBAUTOMATION_AUTHORIZED_DOMAIN_ALLOWLIST';
const AUTHORIZED_STRICT_ENV = 'JOBAUTOMATION_AUTHORIZED_DOMAIN_STRICT';

export type AuthorizedDomainDecision = {
  allowed: boolean;
  reason: 'scope_allowed' | 'allowlist_missing' | 'domain_not_authorized' | 'invalid_target_url';
  host: string | null;
  allowlist: string[];
  strict: boolean;
};

function normalizeRule(rule: string): string {
  return rule.trim().toLowerCase().replace(/^\.+/, '').replace(/\.+$/, '');
}

export function parseAuthorizedDomainAllowlist(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return Array.from(
    new Set(
      raw
        .split(',')
        .map((rule) => normalizeRule(rule))
        .filter((rule) => rule.length > 0)
    )
  );
}

function hostMatchesRule(host: string, rule: string): boolean {
  if (rule.startsWith('*.')) {
    const baseDomain = rule.slice(2);
    return host === baseDomain || host.endsWith(`.${baseDomain}`);
  }

  return host === rule || host.endsWith(`.${rule}`);
}

export function evaluateAuthorizedDomainPolicy(targetUrl: string): AuthorizedDomainDecision {
  const allowlist = parseAuthorizedDomainAllowlist(process.env[AUTHORIZED_ALLOWLIST_ENV]);
  const strict = process.env[AUTHORIZED_STRICT_ENV] === '1';

  let host: string | null = null;
  try {
    host = new URL(targetUrl).hostname.toLowerCase();
  } catch {
    return {
      allowed: false,
      reason: 'invalid_target_url',
      host,
      allowlist,
      strict
    };
  }

  if (allowlist.length === 0) {
    return {
      allowed: !strict,
      reason: strict ? 'allowlist_missing' : 'scope_allowed',
      host,
      allowlist,
      strict
    };
  }

  const allowed = allowlist.some((rule) => hostMatchesRule(host, rule));
  return {
    allowed,
    reason: allowed ? 'scope_allowed' : 'domain_not_authorized',
    host,
    allowlist,
    strict
  };
}
