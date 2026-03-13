import type { NormalizedJob } from './normalized-job';
import type { SourceKind } from '../types/source-kind';

export type SourceAdapterContext = {
  capturedAt: Date;
};

export interface SourceAdapter<TSourceJob = unknown> {
  sourceKind: SourceKind;
  normalizeJob(sourceJob: TSourceJob, context: SourceAdapterContext): NormalizedJob;
}
