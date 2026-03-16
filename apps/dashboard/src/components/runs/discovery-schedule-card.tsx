import type { DiscoveryScheduleRecord } from '@jobautomation/core';

export function DiscoveryScheduleCard({
  schedule,
  updateAction
}: {
  schedule: DiscoveryScheduleRecord;
  updateAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Schedule</p>
        <h3 className="mt-2 text-xl font-semibold text-slate-900">Structured discovery schedule</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Runs every enabled structured source through the in-process queue using one persisted cron schedule.
        </p>
      </div>
      <form action={updateAction} className="mt-6 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
        <label className="grid gap-2 text-sm text-slate-700">
          <span>Cron expression</span>
          <input
            name="cronExpression"
            defaultValue={schedule.cronExpression}
            className="rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-500"
          />
        </label>
        <label className="grid gap-2 text-sm text-slate-700">
          <span>Timezone</span>
          <input
            name="timezone"
            defaultValue={schedule.timezone}
            className="rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-500"
          />
        </label>
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input name="enabled" type="checkbox" defaultChecked={schedule.enabled} className="size-4 rounded border-slate-300" />
            Enabled
          </label>
          <button className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700">
            Save schedule
          </button>
        </div>
      </form>
    </section>
  );
}
