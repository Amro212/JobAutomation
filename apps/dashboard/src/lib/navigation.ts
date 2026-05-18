/**
 * Logical parent route for the header back control.
 * Uses route hierarchy instead of browser history so flash ?message= / ?error=
 * redirects do not trap users in query-param history entries.
 */
export function getBackHref(pathname: string): string | null {
  const normalized =
    pathname.length > 1 && pathname.endsWith('/')
      ? pathname.slice(0, -1)
      : pathname;

  const jobArtifacts = normalized.match(/^\/jobs\/([^/]+)\/artifacts$/);
  if (jobArtifacts) {
    return `/jobs/${jobArtifacts[1]}`;
  }

  const jobDetail = normalized.match(/^\/jobs\/([^/]+)$/);
  if (jobDetail) {
    return '/jobs';
  }

  const applicationRun = normalized.match(/^\/applications\/([^/]+)$/);
  if (applicationRun) {
    return '/applications';
  }

  const runDetail = normalized.match(/^\/runs\/([^/]+)$/);
  if (runDetail) {
    return '/runs';
  }

  const topLevel = new Set([
    '/jobs',
    '/applications',
    '/runs',
    '/autopilot',
    '/submitted',
    '/shortlist',
    '/setup',
  ]);
  if (topLevel.has(normalized)) {
    return '/';
  }

  return null;
}
