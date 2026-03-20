import { Skeleton } from '@/components/ui/skeleton';

export default function RunDetailLoading() {
  return (
    <section className="space-y-6">
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="mt-2 h-8 w-64" />
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b px-6 py-4">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="mt-2 h-7 w-32" />
        </div>
        <div className="space-y-3 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b px-6 py-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="mt-2 h-7 w-36" />
        </div>
        <div className="space-y-3 p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </section>
  );
}
