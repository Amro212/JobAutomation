import type { DiscoverySourceRecord } from '@jobautomation/core';

export function DiscoverySourcesPanel({
  sources,
  createAction,
  runAction,
  toggleAction
}: {
  sources: DiscoverySourceRecord[];
  createAction: (formData: FormData) => Promise<void>;
  runAction: (formData: FormData) => Promise<void>;
  toggleAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <section className="space-y-4 rounded-3xl bg-white p-8 shadow-sm">
      <div>
        <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Discovery Sources</p>
        <h3 className="mt-2 text-xl font-semibold text-slate-900">Structured and fallback source onboarding</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Add Greenhouse, Lever, Ashby, or a persisted Playwright fallback source. Playwright
          sources use a canonical public jobs or listings URL and remain inspectable through the
          same runs, logs, and artifact views.
        </p>
      </div>

      <form action={createAction} className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[0.9fr_1.2fr_1.2fr_auto] md:items-end">
        <label className="space-y-2 text-sm text-slate-700">
          <span className="font-medium">Source type</span>
          <select
            name="sourceKind"
            defaultValue="greenhouse"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
            aria-label="Source type"
          >
            <option value="greenhouse">Greenhouse</option>
            <option value="lever">Lever</option>
            <option value="ashby">Ashby</option>
            <option value="playwright">Playwright</option>
          </select>
        </label>
        <label className="space-y-2 text-sm text-slate-700">
          <span className="font-medium">Board label</span>
          <input
            name="label"
            required
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
          />
        </label>
        <label className="space-y-2 text-sm text-slate-700">
          <span className="font-medium">Source token or URL</span>
          <input
            name="sourceKey"
            required
            aria-label="Source token or URL"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
          />
        </label>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input name="enabled" type="checkbox" defaultChecked className="h-4 w-4" />
            <span>Enabled</span>
          </label>
          <button
            type="submit"
            className="w-full rounded-full bg-slate-900 px-4 py-3 text-sm font-medium text-white"
          >
            Add source
          </button>
        </div>
      </form>

      {sources.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-600">
          No discovery sources configured yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Label</th>
                <th className="px-4 py-3 font-medium">Source Key</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {sources.map((source) => (
                <tr key={source.id}>
                  <td className="px-4 py-3 capitalize text-slate-700">{source.sourceKind}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{source.label}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{source.sourceKey}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {source.enabled ? 'Enabled' : 'Disabled'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <form action={toggleAction}>
                        <input type="hidden" name="sourceId" value={source.id} />
                        <input type="hidden" name="enabled" value={source.enabled ? 'false' : 'true'} />
                        <button
                          type="submit"
                          className="rounded-full border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700"
                        >
                          {source.enabled ? 'Disable' : 'Enable'}
                        </button>
                      </form>
                      <form action={runAction}>
                        <input type="hidden" name="sourceId" value={source.id} />
                        <button
                          type="submit"
                          disabled={!source.enabled}
                          className="rounded-full bg-slate-900 px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          Run now
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
