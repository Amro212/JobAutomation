import { Skeleton } from '@/components/ui/skeleton';

export default function SetupLoading() {
  return (
    <section className="space-y-4">
      <div>
        <Skeleton className="h-4 w-14" />
        <Skeleton className="mt-2 h-8 w-72" />
        <Skeleton className="mt-2 h-5 w-full max-w-lg" />
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
        <Skeleton className="mt-6 h-24 rounded-lg" />
        <Skeleton className="mt-6 h-32 rounded-lg" />
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
        <Skeleton className="mt-6 h-64 rounded-lg" />
        <div className="mt-6 flex justify-end">
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>
      </div>
    </section>
  );
}
