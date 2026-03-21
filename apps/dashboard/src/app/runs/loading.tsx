import { Skeleton } from '@/components/ui/skeleton';

export default function RunsLoading() {
  return (
    <section className="space-y-6">
      <div>
        <Skeleton className="h-4 w-12" />
        <Skeleton className="mt-2 h-8 w-56" />
        <Skeleton className="mt-2 h-5 w-full max-w-lg" />
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="mt-2 h-6 w-64" />
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-12 rounded-lg" />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="space-y-3 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </section>
  );
}
