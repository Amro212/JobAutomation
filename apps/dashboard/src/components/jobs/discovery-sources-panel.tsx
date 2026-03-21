import type { DiscoverySourceRecord } from '@jobautomation/core';

import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SubmitButton } from '@/components/submit-button';

export function DiscoverySourcesPanel({
  sources,
  createAction,
  runAction,
  toggleAction,
  importAction
}: {
  sources: DiscoverySourceRecord[];
  createAction: (formData: FormData) => Promise<void>;
  runAction: (formData: FormData) => Promise<void>;
  toggleAction: (formData: FormData) => Promise<void>;
  importAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Discovery Sources
        </p>
        <h3 className="mt-2 text-xl font-semibold text-foreground">
          Structured and fallback source onboarding
        </h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Add Greenhouse, Lever, Ashby, or a persisted Playwright fallback source. Playwright
          sources use a canonical public jobs or listings URL and remain inspectable through the
          same runs, logs, and artifact views.
        </p>
      </div>

      <form
        action={createAction}
        className="grid gap-4 rounded-lg border bg-muted/50 p-4 md:grid-cols-[0.9fr_1.2fr_1.2fr_auto] md:items-end"
      >
        <label className="space-y-2 text-sm text-foreground">
          <span className="font-medium">Source type</span>
          <select
            name="sourceKind"
            defaultValue="greenhouse"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Source type"
          >
            <option value="greenhouse">Greenhouse</option>
            <option value="lever">Lever</option>
            <option value="ashby">Ashby</option>
            <option value="playwright">Playwright</option>
          </select>
        </label>
        <label className="space-y-2 text-sm text-foreground">
          <span className="font-medium">Board label</span>
          <Input name="label" required />
        </label>
        <label className="space-y-2 text-sm text-foreground">
          <span className="font-medium">Source token or URL</span>
          <Input name="sourceKey" required aria-label="Source token or URL" />
        </label>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input name="enabled" type="checkbox" defaultChecked className="h-4 w-4 rounded border-input" />
            <span>Enabled</span>
          </label>
          <SubmitButton className="w-full" pendingText="Adding...">
            Add source
          </SubmitButton>
        </div>
      </form>

      <form
        action={importAction}
        className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 px-4 py-3"
      >
        <label className="flex flex-col gap-1 text-sm text-foreground">
          <span className="font-medium">Bulk import via CSV</span>
          <input
            type="file"
            name="csvFile"
            accept=".csv"
            required
            className="text-sm text-muted-foreground file:mr-3 file:rounded file:border file:border-input file:bg-background file:px-3 file:py-1 file:text-xs file:font-medium file:text-foreground"
          />
        </label>
        <div className="flex items-center gap-2">
          <SubmitButton size="sm" pendingText="Importing...">
            Import CSV
          </SubmitButton>
          <a
            href="/discovery-sources-template.csv"
            download
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Download template
          </a>
        </div>
      </form>

      {sources.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
          No discovery sources configured yet.
        </div>
      ) : (
        <details className="rounded-lg border" open={false}>
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-foreground">
            Source table ({sources.length})
          </summary>
          <div className="overflow-hidden border-t">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Type</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Source Key</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map((source) => (
                  <TableRow key={source.id}>
                    <TableCell className="capitalize">{source.sourceKind}</TableCell>
                    <TableCell className="font-medium">{source.label}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {source.sourceKey}
                    </TableCell>
                    <TableCell>
                      <Badge variant={source.enabled ? 'success' : 'secondary'}>
                        {source.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <form action={toggleAction}>
                          <input type="hidden" name="sourceId" value={source.id} />
                          <input type="hidden" name="enabled" value={source.enabled ? 'false' : 'true'} />
                          <SubmitButton
                            variant="outline"
                            size="sm"
                            pendingText={source.enabled ? 'Disabling...' : 'Enabling...'}
                          >
                            {source.enabled ? 'Disable' : 'Enable'}
                          </SubmitButton>
                        </form>
                        <form action={runAction}>
                          <input type="hidden" name="sourceId" value={source.id} />
                          <SubmitButton
                            size="sm"
                            disabled={!source.enabled}
                            pendingText="Running..."
                          >
                            Run now
                          </SubmitButton>
                        </form>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </details>
      )}
    </section>
  );
}
