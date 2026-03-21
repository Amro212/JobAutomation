import { Skeleton } from '@/components/ui/skeleton';

export default function ArtifactsLoading() {
  return (
    <section className="space-y-6">
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Skeleton className="h-4 w-16" />
            <Skeleton className="mt-2 h-8 w-64" />
            <Skeleton className="mt-2 h-5 w-48" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-9 w-44 rounded-md" />
            <Skeleton className="h-9 w-48 rounded-md" />
          </div>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="mt-2 h-7 w-32" />
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-[30rem] rounded-lg" />
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="mt-2 h-7 w-64" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </section>
  );
}
