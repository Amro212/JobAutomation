import Link from 'next/link';

import { Button } from '@/components/ui/button';

export function JobsPagination({
  currentPage,
  pageSize,
  total,
  hrefForPage
}: {
  currentPage: number;
  pageSize: number;
  total: number;
  hrefForPage: (page: number) => string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, total);

  if (total === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 border-t bg-card/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <p className="text-sm text-muted-foreground">
        Showing {from}–{to} of {total}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {currentPage > 1 ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={hrefForPage(currentPage - 1)}>Previous</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Previous
          </Button>
        )}
        <span className="px-2 text-sm text-muted-foreground">
          Page {currentPage} of {totalPages}
        </span>
        {currentPage < totalPages ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={hrefForPage(currentPage + 1)}>Next</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Next
          </Button>
        )}
      </div>
    </div>
  );
}
