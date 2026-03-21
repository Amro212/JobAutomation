import { JOB_LIST_DEFAULT_PAGE_SIZE } from '@jobautomation/core';

import { JobsPagination } from '@/components/jobs/jobs-pagination';
import { JobsTable } from '@/components/jobs/jobs-table';
import { getJobs } from '@/lib/api';

function buildShortlistHref(page: number, pageSize: number): string {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));
  return `/shortlist?${params.toString()}`;
}

export default async function ShortlistPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const rawPage = Array.isArray(resolvedSearchParams.page)
    ? resolvedSearchParams.page[0]
    : resolvedSearchParams.page;
  const rawPageSize = Array.isArray(resolvedSearchParams.pageSize)
    ? resolvedSearchParams.pageSize[0]
    : resolvedSearchParams.pageSize;

  const page = Math.max(1, Number(rawPage) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(rawPageSize) || JOB_LIST_DEFAULT_PAGE_SIZE));

  const { jobs, total } = await getJobs(
    { status: 'shortlisted' },
    { page, pageSize }
  );

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Shortlist
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-foreground">
          Persisted shortlist workflow
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Jobs moved into shortlisted state stay visible here until you send them back to
          reviewing or archive them.
        </p>
      </div>
      <JobsTable
        jobs={jobs}
        emptyMessage="No shortlisted jobs yet."
        footer={
          <JobsPagination
            currentPage={page}
            pageSize={pageSize}
            total={total}
            hrefForPage={(nextPage: number) => buildShortlistHref(nextPage, pageSize)}
          />
        }
      />
    </section>
  );
}
