import { RunsTable } from '../../components/runs/runs-table';
import { getDiscoveryRuns } from '../../lib/api';

export default async function RunsPage(): Promise<JSX.Element> {
  const runs = await getDiscoveryRuns();

  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Runs</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">Discovery run history</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Early run visibility matters because discovery is the first major subsystem in this product.</p>
      </div>
      <RunsTable runs={runs} />
    </section>
  );
}
