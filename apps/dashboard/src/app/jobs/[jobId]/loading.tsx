import { Skeleton } from '@/components/ui/skeleton';

export default function JobDetailLoading() {
  return (
    <section className="space-y-6">
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="mt-2 h-8 w-80" />
        <Skeleton className="mt-2 h-5 w-48" />
        <div className="mt-4 flex gap-3">
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-8 w-36 rounded-md" />
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
        <Skeleton className="mt-6 h-32 rounded-lg" />
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-2 h-8 w-48" />
        <Skeleton className="mt-2 h-5 w-full max-w-md" />
        <div className="mt-6 space-y-4">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-9 w-28 self-end rounded-md" />
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
        </div>
      </div>
    </section>
  );
}
