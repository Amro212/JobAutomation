import { Skeleton } from '@/components/ui/skeleton';

export default function ApplicationRunLoading() {
  return (
    <section className="space-y-6">
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-2 h-8 w-72" />
        <Skeleton className="mt-2 h-5 w-full max-w-lg" />
        <div className="mt-4 flex gap-3">
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="h-9 w-36 rounded-md" />
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-16 rounded-lg" />
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-2 h-6 w-64" />
        <Skeleton className="mt-4 h-20 w-full rounded-lg" />
      </div>
    </section>
  );
}
