'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Check, CircleHelp, Search, SlidersHorizontal, X } from 'lucide-react';

import type {
  AutopilotSettingsRecord,
  DiscoverySourceRecord,
} from '@jobautomation/core';

import { SubmitButton } from '@/components/submit-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type SiteKey = 'greenhouse' | 'lever' | 'ashby';
type SourceScope = 'all' | 'custom';

const siteKeys: Array<{ value: SiteKey; label: string }> = [
  { value: 'greenhouse', label: 'Greenhouse' },
  { value: 'lever', label: 'Lever' },
  { value: 'ashby', label: 'Ashby' },
];

const selectClassName =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
const pressableClassName =
  'cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

function sourceMatchesSearch(
  source: DiscoverySourceRecord,
  search: string
): boolean {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) {
    return true;
  }

  return [source.label, source.sourceKind, source.sourceKey].some((value) =>
    value.toLowerCase().includes(normalizedSearch)
  );
}

function sourceKindLabel(value: string): string {
  return value === 'playwright' ? 'Fallback' : value;
}

function scopeLabel(
  scope: SourceScope,
  selectedCount: number,
  totalCount: number
): string {
  return scope === 'all'
    ? `All enabled (${totalCount})`
    : `${selectedCount} of ${totalCount} selected`;
}

function FieldHelp({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={`About ${label}`}
        aria-describedby={id}
        className="inline-flex size-5 cursor-help items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <CircleHelp className="size-4" aria-hidden="true" />
      </button>
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-64 -translate-x-1/2 rounded-md border bg-popover px-3 py-2 text-xs font-normal leading-5 text-popover-foreground opacity-0 shadow-sm transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
      >
        {children}
      </span>
    </span>
  );
}

function LabelWithHelp({
  htmlFor,
  label,
  helpId,
  help,
}: {
  htmlFor: string;
  label: string;
  helpId: string;
  help: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor={htmlFor} className="font-medium">
        {label}
      </label>
      <FieldHelp id={helpId} label={label}>
        {help}
      </FieldHelp>
    </div>
  );
}

export function AutopilotSettingsCard({
  enabledSources,
  settings,
  hasActiveRun,
  saveAction,
  launchAction,
}: {
  enabledSources: DiscoverySourceRecord[];
  settings: AutopilotSettingsRecord;
  hasActiveRun: boolean;
  saveAction: (formData: FormData) => Promise<void>;
  launchAction: (formData: FormData) => Promise<void>;
}) {
  const allSourceIds = useMemo(
    () => enabledSources.map((source) => source.id),
    [enabledSources]
  );
  const initialSourceIds = useMemo(() => {
    if (settings.config.discoverySourceIds.length === 0) {
      return allSourceIds;
    }

    return settings.config.discoverySourceIds.filter((sourceId) =>
      allSourceIds.includes(sourceId)
    );
  }, [allSourceIds, settings.config.discoverySourceIds]);

  const [sourceScope, setSourceScope] = useState<SourceScope>(
    settings.config.discoverySourceIds.length === 0 ? 'all' : 'custom'
  );
  const [selectedSourceIds, setSelectedSourceIds] = useState(initialSourceIds);
  const [selectedSiteKeys, setSelectedSiteKeys] = useState<SiteKey[]>(
    settings.config.applySiteKeys
  );
  const [sourceSearch, setSourceSearch] = useState('');

  const selectedSourceSet = useMemo(
    () => new Set(selectedSourceIds),
    [selectedSourceIds]
  );
  const visibleSources = useMemo(
    () =>
      enabledSources.filter((source) =>
        sourceMatchesSearch(source, sourceSearch)
      ),
    [enabledSources, sourceSearch]
  );
  const sourceKindCounts = useMemo(() => {
    return enabledSources.reduce<Record<string, number>>((counts, source) => {
      counts[source.sourceKind] = (counts[source.sourceKind] ?? 0) + 1;
      return counts;
    }, {});
  }, [enabledSources]);

  const activeSourceCount =
    sourceScope === 'all' ? enabledSources.length : selectedSourceIds.length;
  const canSave =
    selectedSiteKeys.length > 0 &&
    (sourceScope === 'all' || selectedSourceIds.length > 0);
  const canLaunch = canSave && enabledSources.length > 0 && !hasActiveRun;

  function toggleSource(sourceId: string): void {
    setSelectedSourceIds((current) =>
      current.includes(sourceId)
        ? current.filter((id) => id !== sourceId)
        : [...current, sourceId]
    );
  }

  function toggleSite(siteKey: SiteKey): void {
    setSelectedSiteKeys((current) =>
      current.includes(siteKey)
        ? current.filter((key) => key !== siteKey)
        : [...current, siteKey]
    );
  }

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <form className="space-y-5">
        <input type="hidden" name="sourceScope" value={sourceScope} />
        {sourceScope === 'custom'
          ? selectedSourceIds.map((sourceId) => (
              <input
                key={sourceId}
                type="hidden"
                name="discoverySourceId"
                value={sourceId}
              />
            ))
          : null}
        {selectedSiteKeys.map((siteKey) => (
          <input
            key={siteKey}
            type="hidden"
            name="applySiteKey"
            value={siteKey}
          />
        ))}

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Launch settings
            </p>
            <h3 className="mt-2 text-xl font-semibold text-foreground">
              Autopilot controls
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Configure one batch without scanning a long source list. Global
              source enablement stays on the{' '}
              <Link
                href="/jobs"
                className="text-primary underline-offset-4 hover:underline"
              >
                Jobs page
              </Link>
              .
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">
              {scopeLabel(
                sourceScope,
                activeSourceCount,
                enabledSources.length
              )}
            </Badge>
            <Badge variant="secondary">{selectedSiteKeys.length} sites</Badge>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
          <fieldset className="rounded-lg border bg-muted/30 p-4">
            <legend className="px-1 text-sm font-medium text-foreground">
              <span className="flex items-center gap-1.5">
                Discovery scope
                <FieldHelp
                  id="autopilot-discovery-scope-help"
                  label="Discovery scope"
                >
                  Choose whether this run uses every enabled source or only the
                  custom sources selected below.
                </FieldHelp>
              </span>
            </legend>

            <div className="mt-1 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                aria-pressed={sourceScope === 'all'}
                aria-label="Use all enabled discovery sources"
                onClick={() => setSourceScope('all')}
                className={cn(
                  pressableClassName,
                  'rounded-md border px-3 py-2 text-left text-sm transition-colors',
                  sourceScope === 'all'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-background hover:bg-accent'
                )}
              >
                <span className="block font-medium">All enabled</span>
                <span
                  className={cn(
                    'mt-1 block text-xs',
                    sourceScope === 'all'
                      ? 'text-primary-foreground/80'
                      : 'text-muted-foreground'
                  )}
                >
                  {enabledSources.length} sources
                </span>
              </button>
              <button
                type="button"
                aria-pressed={sourceScope === 'custom'}
                aria-label="Use custom discovery sources"
                onClick={() => setSourceScope('custom')}
                className={cn(
                  pressableClassName,
                  'rounded-md border px-3 py-2 text-left text-sm transition-colors',
                  sourceScope === 'custom'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-background hover:bg-accent'
                )}
              >
                <span className="block font-medium">Custom</span>
                <span
                  className={cn(
                    'mt-1 block text-xs',
                    sourceScope === 'custom'
                      ? 'text-primary-foreground/80'
                      : 'text-muted-foreground'
                  )}
                >
                  {selectedSourceIds.length} selected
                </span>
              </button>
            </div>

            {sourceScope === 'all' ? (
              <div className="mt-4 rounded-md border bg-background px-3 py-3">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(sourceKindCounts).map(([kind, count]) => (
                    <Badge key={kind} variant="outline" className="capitalize">
                      {sourceKindLabel(kind)}: {count}
                    </Badge>
                  ))}
                  {enabledSources.length === 0 ? (
                    <span className="text-sm text-muted-foreground">
                      No enabled sources yet.
                    </span>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-56 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
                    <Input
                      value={sourceSearch}
                      onChange={(event) => setSourceSearch(event.target.value)}
                      placeholder="Search sources"
                      aria-label="Search sources"
                      aria-describedby="autopilot-source-search-help"
                      className="pl-9"
                    />
                  </div>
                  <FieldHelp
                    id="autopilot-source-search-help"
                    label="Search sources"
                  >
                    Filters the visible source list by company label, source
                    type, or source key without changing the current selection.
                  </FieldHelp>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="cursor-pointer"
                    onClick={() => setSelectedSourceIds(allSourceIds)}
                  >
                    <Check />
                    Select all
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="cursor-pointer"
                    onClick={() => setSelectedSourceIds([])}
                  >
                    <X />
                    Clear
                  </Button>
                </div>

                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  {visibleSources.length === 0 ? (
                    <div className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                      No sources match this search.
                    </div>
                  ) : (
                    visibleSources.map((source) => {
                      const selected = selectedSourceSet.has(source.id);
                      return (
                        <button
                          key={source.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => toggleSource(source.id)}
                          className={cn(
                            pressableClassName,
                            'grid w-full grid-cols-[1fr_auto] items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                            selected
                              ? 'border-primary/30 bg-accent text-foreground'
                              : 'bg-background hover:bg-accent/60'
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">
                              {source.label}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {source.sourceKey}
                            </span>
                          </span>
                          <span className="flex items-center gap-2">
                            <Badge variant="outline" className="capitalize">
                              {sourceKindLabel(source.sourceKind)}
                            </Badge>
                            {selected ? (
                              <Check className="size-4 text-primary" />
                            ) : null}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </fieldset>

          <fieldset className="rounded-lg border bg-muted/30 p-4">
            <legend className="px-1 text-sm font-medium text-foreground">
              <span className="flex items-center gap-1.5">
                Apply sites
                <FieldHelp id="autopilot-apply-sites-help" label="Apply sites">
                  Select which job-board application flows autopilot may use
                  after discovery finds eligible jobs.
                </FieldHelp>
              </span>
            </legend>
            <div className="mt-1 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="cursor-pointer"
                onClick={() =>
                  setSelectedSiteKeys(siteKeys.map((site) => site.value))
                }
              >
                Select all
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="cursor-pointer"
                onClick={() => setSelectedSiteKeys([])}
              >
                Clear
              </Button>
            </div>
            <div className="mt-3 grid gap-2">
              {siteKeys.map((site) => {
                const selected = selectedSiteKeys.includes(site.value);
                return (
                  <button
                    key={site.value}
                    type="button"
                    aria-pressed={selected}
                    aria-label={`${site.label} application site`}
                    onClick={() => toggleSite(site.value)}
                    className={cn(
                      pressableClassName,
                      'flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors',
                      selected
                        ? 'border-primary/30 bg-accent text-foreground'
                        : 'bg-background hover:bg-accent/60'
                    )}
                  >
                    <span className="font-medium">{site.label}</span>
                    {selected ? (
                      <Check className="size-4 text-primary" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>

        <fieldset className="rounded-lg border bg-muted/20 p-4">
          <legend className="flex items-center gap-2 px-1 text-sm font-medium text-foreground">
            <SlidersHorizontal className="size-4" />
            Run limits
            <FieldHelp id="autopilot-run-limits-help" label="Run limits">
              Tune how broadly autopilot searches and which artifacts it
              prepares before application steps begin.
            </FieldHelp>
          </legend>
          <div className="mt-1 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2 text-sm">
              <LabelWithHelp
                htmlFor="autopilot-match-profile"
                label="Match scope"
                helpId="autopilot-match-profile-help"
                help="Auto follows the same match scope as the Jobs tab. My matches only keeps autopilot restricted to jobs matching your saved profile."
              />
              <select
                id="autopilot-match-profile"
                name="matchProfile"
                aria-describedby="autopilot-match-profile-help"
                className={selectClassName}
                defaultValue={settings.config.matchProfile ?? ''}
              >
                <option value="">Auto from profile</option>
                <option value="me">My matches only</option>
              </select>
            </div>

            <div className="space-y-2 text-sm">
              <LabelWithHelp
                htmlFor="autopilot-max-jobs"
                label="Max jobs"
                helpId="autopilot-max-jobs-help"
                help="Caps how many eligible jobs this batch may process. Leave blank to let the backend run without a per-run cap."
              />
              <Input
                id="autopilot-max-jobs"
                name="maxJobsPerRun"
                aria-describedby="autopilot-max-jobs-help"
                type="number"
                min={1}
                max={100}
                defaultValue={settings.config.maxJobsPerRun ?? ''}
                placeholder="Unlimited"
              />
            </div>

            <div className="space-y-2 text-sm">
              <LabelWithHelp
                htmlFor="autopilot-cache-hours"
                label="Cache hours"
                helpId="autopilot-cache-hours-help"
                help="Reuses a recent discovery run within this many hours. Set 0 or force fresh discovery to skip reuse."
              />
              <Input
                id="autopilot-cache-hours"
                name="discoveryCacheHours"
                aria-describedby="autopilot-cache-hours-help"
                type="number"
                min={0}
                max={72}
                step={1}
                defaultValue={settings.config.discoveryCacheHours}
              />
            </div>

            <div className="space-y-2 text-sm">
              <LabelWithHelp
                htmlFor="autopilot-artifact-mode"
                label="Artifacts"
                helpId="autopilot-artifact-mode-help"
                help="Controls whether autopilot prepares a tailored resume, a cover letter, or both before application submission."
              />
              <select
                id="autopilot-artifact-mode"
                name="artifactMode"
                aria-describedby="autopilot-artifact-mode-help"
                defaultValue={settings.config.artifactMode}
                className={selectClassName}
              >
                <option value="both">Resume and cover letter</option>
                <option value="resume">Resume only</option>
                <option value="cover-letter">Cover letter only</option>
              </select>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm">
            <input
              id="autopilot-force-fresh-discovery"
              name="forceFreshDiscovery"
              type="checkbox"
              aria-describedby="autopilot-force-fresh-discovery-help"
              defaultChecked={settings.config.forceFreshDiscovery}
              className="size-4 cursor-pointer rounded border-input"
            />
            <label
              htmlFor="autopilot-force-fresh-discovery"
              className="cursor-pointer"
            >
              Force fresh discovery
            </label>
            <FieldHelp
              id="autopilot-force-fresh-discovery-help"
              label="Force fresh discovery"
            >
              Ignores cached discovery results and queues a new discovery pass
              before applying.
            </FieldHelp>
          </div>
        </fieldset>

        {!canSave ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            Select at least one source and one application site before saving or
            launching.
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <SubmitButton
            formAction={saveAction}
            variant="outline"
            pendingText="Saving..."
            disabled={!canSave}
          >
            Save
          </SubmitButton>
          <SubmitButton
            formAction={launchAction}
            disabled={!canLaunch}
            pendingText="Launching..."
            title={
              hasActiveRun
                ? 'Stop the active run before launching another batch'
                : undefined
            }
          >
            Launch autopilot
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}
