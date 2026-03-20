import type { DiscoveryScheduleRecord } from '@jobautomation/core';

import { Input } from '@/components/ui/input';
import { SubmitButton } from '@/components/submit-button';

export function DiscoveryScheduleCard({
  schedule,
  updateAction
}: {
  schedule: DiscoveryScheduleRecord;
  updateAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <section className="rounded-xl border bg-card p-6 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Schedule
        </p>
        <h3 className="mt-2 text-xl font-semibold text-foreground">
          Structured discovery schedule
        </h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Runs every enabled structured source through the in-process queue using one persisted cron
          schedule.
        </p>
      </div>
      <form
        action={updateAction}
        className="mt-6 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end"
      >
        <label className="grid gap-2 text-sm">
          <span className="font-medium">Cron expression</span>
          <Input name="cronExpression" defaultValue={schedule.cronExpression} />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="font-medium">Timezone</span>
          <Input name="timezone" defaultValue={schedule.timezone} />
        </label>
        <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/50 px-4 py-2.5">
          <label className="flex items-center gap-2 text-sm">
            <input
              name="enabled"
              type="checkbox"
              defaultChecked={schedule.enabled}
              className="size-4 rounded border-input"
            />
            Enabled
          </label>
          <SubmitButton pendingText="Saving...">Save schedule</SubmitButton>
        </div>
      </form>
    </section>
  );
}
