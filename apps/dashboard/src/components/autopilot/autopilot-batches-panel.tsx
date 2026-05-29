import { AutopilotBatchDetail } from '@/components/autopilot/autopilot-batch-detail';
import { AutopilotBatchesList } from '@/components/autopilot/autopilot-batches-list';
import type { AutopilotRunDetail, AutopilotRunSummary } from '@/lib/api';

type AutopilotBatchesPanelProps = {
  runs: AutopilotRunSummary[];
  selectedRun: AutopilotRunDetail | null;
};

export function AutopilotBatchesPanel({ runs, selectedRun }: AutopilotBatchesPanelProps) {
  const showingDetail = selectedRun !== null;

  return (
    <section
      className="overflow-hidden rounded-xl border bg-card shadow-sm"
      aria-labelledby="autopilot-batches-heading"
    >
      <div className="border-b px-6 py-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Batches
        </p>
        <h3 id="autopilot-batches-heading" className="mt-2 text-xl font-semibold text-foreground">
          {showingDetail ? 'Autopilot batch detail' : 'Latest autopilot runs'}
        </h3>
        {!showingDetail ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Select a batch to inspect outcomes without leaving this page.
          </p>
        ) : null}
      </div>

      {showingDetail ? (
        <AutopilotBatchDetail selectedRun={selectedRun} />
      ) : runs.length === 0 ? (
        <div className="px-6 py-5 text-sm text-muted-foreground">
          No autopilot batches have been launched yet.
        </div>
      ) : (
        <AutopilotBatchesList runs={runs} />
      )}
    </section>
  );
}
