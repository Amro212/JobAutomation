'use client';

import { useState, type ReactNode } from 'react';
import { CircleHelp, Copy, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DISCOVERY_SOURCES_CSV_AI_PROMPT,
  DISCOVERY_SOURCES_CSV_AI_PROMPT_HELP,
  DISCOVERY_SOURCES_CSV_BULK_IMPORT_HELP,
  DISCOVERY_SOURCES_CSV_TEMPLATE_HELP,
} from '@/components/jobs/discovery-sources-csv-prompt';

function InlineHelp({
  id,
  label,
  children,
  align = 'center',
}: {
  id: string;
  label: string;
  children: ReactNode;
  align?: 'center' | 'end';
}) {
  const positionClass =
    align === 'end'
      ? 'right-0 translate-x-0'
      : 'left-1/2 -translate-x-1/2';

  return (
    <span className="group relative inline-flex shrink-0">
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
        className={`pointer-events-none absolute top-full z-30 mt-2 w-80 rounded-md border bg-popover px-3 py-2 text-xs font-normal leading-5 text-popover-foreground opacity-0 shadow-sm transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 ${positionClass}`}
      >
        {children}
      </span>
    </span>
  );
}

export function DiscoverySourcesCsvBulkImportLabel() {
  return (
    <span className="inline-flex items-center gap-1 font-medium">
      Bulk import via CSV
      <InlineHelp id="csv-bulk-import-help" label="bulk CSV import">
        {DISCOVERY_SOURCES_CSV_BULK_IMPORT_HELP}
      </InlineHelp>
    </span>
  );
}

export function DiscoverySourcesCsvTemplateLink() {
  return (
    <span className="inline-flex items-center gap-1">
      <a
        href="/discovery-sources-template.csv"
        download
        className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        Download template
      </a>
      <InlineHelp id="csv-template-help" label="CSV template">
        {DISCOVERY_SOURCES_CSV_TEMPLATE_HELP}
      </InlineHelp>
    </span>
  );
}

export function DiscoverySourcesCsvAiPromptActions() {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(DISCOVERY_SOURCES_CSV_AI_PROMPT);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-l border-border/80 pl-3 sm:pl-4">
      <span className="inline-flex items-center gap-1 text-sm text-foreground">
        <span className="font-medium">AI prompt</span>
        <InlineHelp id="csv-ai-prompt-help" label="AI prompt" align="end">
          {DISCOVERY_SOURCES_CSV_AI_PROMPT_HELP}
        </InlineHelp>
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1 px-2 text-xs"
        onClick={() => void handleCopy()}
        aria-live="polite"
      >
        {copied ? (
          <>
            <Check className="size-3.5" aria-hidden="true" />
            Copied
          </>
        ) : (
          <>
            <Copy className="size-3.5" aria-hidden="true" />
            Copy prompt
          </>
        )}
      </Button>
    </div>
  );
}
