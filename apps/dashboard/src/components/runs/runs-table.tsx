import type { DiscoveryRunRecord } from '@jobautomation/core';

export function RunsTable({ runs }: { runs: DiscoveryRunRecord[] }): JSX.Element {
  if (runs.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-600 shadow-sm">
        No discovery runs have been recorded yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">Source</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">New Jobs</th>
            <th className="px-4 py-3 font-medium">Updated Jobs</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {runs.map((run) => (
            <tr key={run.id}>
              <td className="px-4 py-3 capitalize">{run.sourceKind}</td>
              <td className="px-4 py-3 capitalize">{run.status}</td>
              <td className="px-4 py-3">{run.newJobCount}</td>
              <td className="px-4 py-3">{run.updatedJobCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
