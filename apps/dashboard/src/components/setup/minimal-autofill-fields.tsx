import type { MinimalAutofillProfile } from '@jobautomation/core';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export function MinimalAutofillFields({ profile }: { profile: MinimalAutofillProfile }) {
  return (
    <div className="space-y-6 border-t pt-8">
      <div>
        <h3 className="text-lg font-semibold">Application autofill (minimal)</h3>
        <p className="text-muted-foreground mt-1 text-sm leading-6">
          Seven fields drive deterministic answers on job boards (work authorization, sponsorship, clearance,
          logistics). The automation maps each question to these values—no per-question forms. Optional: keep
          reusable context above for long free-text fallbacks.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block space-y-2 text-sm md:col-span-2">
          <span className="font-medium">Work authorization</span>
          <p className="text-muted-foreground text-xs">
            e.g. “U.S. citizen — authorized to work in the United States without restriction.”
          </p>
          <Textarea
            name="autofill_workAuthorization"
            defaultValue={profile.workAuthorization}
            rows={3}
            placeholder="One clear sentence you would use on “legally authorized to work” questions"
          />
        </label>

        <label className="block space-y-2 text-sm md:col-span-2">
          <span className="font-medium">Authorized countries (optional)</span>
          <p className="text-muted-foreground text-xs">
            Comma-separated ISO codes, e.g. <span className="text-foreground">US, CA, GB</span> — used when forms
            tie authorization to specific countries.
          </p>
          <Input
            name="autofill_workAuthorizationCountriesCsv"
            defaultValue={profile.workAuthorizationCountriesCsv}
            placeholder="US, CA"
          />
        </label>

        <label className="space-y-2 text-sm">
          <span className="font-medium">Requires visa sponsorship?</span>
          <p className="text-muted-foreground text-xs">Maps to H-1B / employment visa questions.</p>
          <select
            name="autofill_requiresSponsorship"
            defaultValue={profile.requiresSponsorship}
            className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <option value="">Not set</option>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>

        <label className="space-y-2 text-sm">
          <span className="font-medium">Security clearance</span>
          <p className="text-muted-foreground text-xs">Defense / government contractor screening.</p>
          <select
            name="autofill_clearanceStatus"
            defaultValue={profile.clearanceStatus}
            className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <option value="">Not set</option>
            <option value="none">None / never held</option>
            <option value="held">Held before</option>
            <option value="eligible">Eligible, not held</option>
            <option value="unsure">Unsure</option>
          </select>
        </label>

        <label className="space-y-2 text-sm">
          <span className="font-medium">Willing to relocate?</span>
          <select
            name="autofill_relocation"
            defaultValue={profile.relocation}
            className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <option value="">Not set</option>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>

        <label className="space-y-2 text-sm">
          <span className="font-medium">Work preference</span>
          <p className="text-muted-foreground text-xs">Remote / hybrid / on-site style questions.</p>
          <select
            name="autofill_workPreference"
            defaultValue={profile.workPreference}
            className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <option value="">Not set</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">On-site</option>
          </select>
        </label>

        <label className="space-y-2 text-sm md:col-span-2">
          <span className="font-medium">Earliest start date</span>
          <p className="text-muted-foreground text-xs">e.g. “2026-06-01”, “2 weeks after offer”, “ASAP”.</p>
          <Input name="autofill_startDate" defaultValue={profile.startDate} placeholder="ASAP" />
        </label>
      </div>
    </div>
  );
}
