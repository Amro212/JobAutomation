import { revalidatePath } from 'next/cache';

import { DiscoveryScheduleCard } from '../../components/runs/discovery-schedule-card';
import { RunsTable } from '../../components/runs/runs-table';
import {
  getDiscoveryRuns,
  getDiscoverySchedule,
  updateDiscoverySchedule
} from '../../lib/api';

async function updateDiscoveryScheduleAction(formData: FormData): Promise<void> {
  'use server';

  await updateDiscoverySchedule({
    cronExpression: String(formData.get('cronExpression') ?? ''),
    timezone: String(formData.get('timezone') ?? ''),
    enabled: formData.get('enabled') === 'on'
  });

  revalidatePath('/runs');
}

export default async function RunsPage() {
  const [runs, schedule] = await Promise.all([getDiscoveryRuns(), getDiscoverySchedule()]);

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Runs</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">Discovery run history</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Early run visibility matters because discovery is the first major subsystem in this product.
        </p>
      </div>
      <DiscoveryScheduleCard schedule={schedule} updateAction={updateDiscoveryScheduleAction} />
      <RunsTable runs={runs} />
    </section>
  );
}
