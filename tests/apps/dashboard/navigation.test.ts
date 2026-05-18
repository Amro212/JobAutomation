import { describe, expect, it } from 'vitest';

import { getBackHref } from '../../../apps/dashboard/src/lib/navigation';

describe('getBackHref', () => {
  it('returns null on overview', () => {
    expect(getBackHref('/')).toBeNull();
  });

  it('returns overview from top-level sections', () => {
    expect(getBackHref('/jobs')).toBe('/');
    expect(getBackHref('/applications')).toBe('/');
  });

  it('returns jobs list from job detail', () => {
    expect(getBackHref('/jobs/job-1')).toBe('/jobs');
  });

  it('returns job detail from artifacts page', () => {
    expect(getBackHref('/jobs/job-1/artifacts')).toBe('/jobs/job-1');
  });

  it('returns applications list from run detail', () => {
    expect(getBackHref('/applications/run-1')).toBe('/applications');
  });

  it('strips trailing slash before matching', () => {
    expect(getBackHref('/jobs/job-1/')).toBe('/jobs');
  });
});
