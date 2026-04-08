import type { SupportedApplicationSite } from '../contracts';

export const LEGACY_GREENHOUSE_APPLICATION_FLOW_REMOVED_MESSAGE =
  'Legacy Greenhouse application automation was removed in Stage 1 of the rewrite and has not been replaced yet.';

export async function runGreenhouseApply(): Promise<never> {
  throw new Error(LEGACY_GREENHOUSE_APPLICATION_FLOW_REMOVED_MESSAGE);
}

export const greenhouseApplicationSite: SupportedApplicationSite = {
  siteKey: 'greenhouse',
  supports(job) {
    return job.sourceKind === 'greenhouse';
  },
  async run(context) {
    await context.logStep(
      'legacy_greenhouse_flow_removed',
      'Legacy Greenhouse automation has been removed and now fails closed pending the rewrite.',
      {
        rewriteStage: 'stage_1_purge'
      }
    );

    return runGreenhouseApply();
  }
};
