import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { getDiscoveryRuns } from '@renderer/lib/api';

export function RunsPage() {
  const [runs, setRuns] = useState<Array<{ id: string; status: string; sourceKind: string }>>([]);

  useEffect(() => {
    void getDiscoveryRuns().then((response) => {
      setRuns(
        response.runs.slice(0, 12).map((run) => ({
          id: run.id,
          status: run.status,
          sourceKind: run.sourceKind
        }))
      );
    });
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <section className="p-8 rounded-[2rem] border border-border bg-card/60 backdrop-blur-3xl shadow-[0_20px_60px_rgba(2,6,23,0.32)]">
        <h1 className="text-2xl font-semibold mb-2">Runs</h1>
        <p className="text-muted-foreground">
          Discovery run history is now a first-class desktop route with direct links into run detail.
        </p>
      </section>

      <section className="p-6 rounded-3xl border border-border bg-card/55 backdrop-blur-[18px]">
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No discovery runs recorded yet.</p>
        ) : (
          <div className="w-full overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-sm text-left">
              <thead className="bg-card/40 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-medium">Run</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {runs.map((run) => (
                  <tr key={run.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3">
                      <Link className="text-sky-400 hover:text-sky-300 transition-colors font-mono" to={`/runs/${run.id}`}>
                        {run.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{run.sourceKind}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-slate-500/10 text-slate-300">
                        {run.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
