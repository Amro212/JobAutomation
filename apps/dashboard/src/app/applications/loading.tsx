import { Skeleton } from '@/components/ui/skeleton';

export default function ApplicationsLoading() {
  return (
    <section className="space-y-6">
      <div>
        <Skeleton className="h-4 w-16" />
        <Skeleton className="mt-2 h-8 w-64" />
        <Skeleton className="mt-2 h-5 w-full max-w-2xl" />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="space-y-3 p-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </section>
  );
}
