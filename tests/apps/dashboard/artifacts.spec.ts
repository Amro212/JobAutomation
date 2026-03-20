import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

const greenhouseJobsResponse = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../fixtures/discovery/greenhouse/jobs-response.json', import.meta.url)),
    'utf8'
  )
) as {
  jobs: Array<{ title: string }>;
};

test('shows setup readiness and generates tailored artifacts for a job', async ({ page }) => {
  const server = createServer((request, response) => {
    if (request.url === '/v1/boards/acme/jobs?content=true') {
      response.writeHead(200, {
        'content-type': 'application/json'
      });
      response.end(JSON.stringify(greenhouseJobsResponse));
      return;
    }

    response.writeHead(404, {
      'content-type': 'application/json'
    });
    response.end(JSON.stringify({ message: 'Not found' }));
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(3202, '127.0.0.1', (error?: Error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  try {
    await page.goto('/setup');
    await page.getByLabel('Full name').fill('Taylor Example');
    await page.getByLabel('Email').fill('taylor@example.com');
    await page.getByLabel('Phone').fill('555-0100');
    await page.getByLabel('Location').fill('Toronto, ON');
    await page.getByLabel('LinkedIn URL').fill('https://www.linkedin.com/in/taylor-example');
    await page.getByLabel('Website URL').fill('https://example.com');
    await page.getByLabel('Professional summary').fill('TypeScript engineer focused on local-first automation.');
    await page
      .getByLabel('Reusable applicant context')
      .fill('Prefers inspectable pipelines and careful release hygiene.');
    await page.getByLabel('Base resume file name').fill('resume.tex');
    await page
      .getByLabel('Stored LaTeX source')
      .fill(
        String.raw`\documentclass{article}
\begin{document}
\section{Experience}
\begin{itemize}
\item Built TypeScript automation systems.
\end{itemize}
\end{document}`
      );
    await page.getByRole('button', { name: 'Save setup' }).click();

    await expect(page.getByText('Tailoring ready')).toBeVisible();

    const apiBaseUrl = 'http://127.0.0.1:3201';
    const sourceResponse = await page.request.post(`${apiBaseUrl}/discovery-sources`, {
      data: {
        sourceKind: 'greenhouse',
        sourceKey: 'acme',
        label: 'Acme Corp',
        enabled: true
      }
    });
    expect(sourceResponse.ok()).toBe(true);
    const source = (await sourceResponse.json()) as { source: { id: string } };

    const runResponse = await page.request.post(`${apiBaseUrl}/discovery-runs`, {
      data: {
        sourceIds: [source.source.id]
      }
    });
    expect(runResponse.ok()).toBe(true);

    await page.goto('/jobs');

    await expect(page.getByRole('link', { name: 'Senior Platform Engineer' })).toBeVisible({
      timeout: 15000
    });
    await page.getByRole('link', { name: 'Senior Platform Engineer' }).click();

    await expect(page.getByRole('link', { name: 'View artifacts' })).toBeVisible();
    await page.getByRole('link', { name: 'View artifacts' }).click();

    await expect(page.getByRole('heading', { name: 'Resume and cover letter versions' })).toBeVisible();
    await expect(page.getByLabel('Generate mode')).toBeVisible();
    await expect(page.getByLabel('Generate mode')).toContainText('Resume and cover letter');
    await expect(page.getByLabel('Generate mode')).toContainText('Resume only');
    await expect(page.getByLabel('Generate mode')).toContainText('Cover letter only');
    await expect(page.getByRole('button', { name: 'Generate tailored artifacts' })).toBeEnabled();

    await page.getByLabel('Generate mode').selectOption('resume');
    await page.getByRole('button', { name: 'Generate tailored artifacts' }).click();
    await expect(page.getByRole('cell', { name: 'resume-variant' }).first()).toBeVisible({
      timeout: 30000
    });
    await expect(page.getByRole('cell', { name: 'resume.tex' }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Rendered PDFs' })).toBeVisible({
      timeout: 30000
    });

    const resumePreview = page.getByTitle('resume-variant preview');
    await expect(resumePreview).toBeVisible();
    const resumePreviewUrl = await resumePreview.getAttribute('src');
    expect(resumePreviewUrl).toContain('/artifacts/');
    expect(resumePreviewUrl).toContain('/file');

    const resumeDownload = page.getByRole('link', { name: 'Download PDF' }).first();
    await expect(resumeDownload).toBeVisible();
    const resumeDownloadUrl = await resumeDownload.getAttribute('href');
    expect(resumeDownloadUrl).toContain('/artifacts/');
    expect(resumeDownloadUrl).toContain('/file?download=1');

    const pdfResponse = await page.request.get(resumePreviewUrl ?? '');
    expect(pdfResponse.ok()).toBe(true);
    expect(pdfResponse.headers()['content-type']).toContain('application/pdf');
    const pdfBytes = await pdfResponse.body();
    expect(Buffer.from(pdfBytes).subarray(0, 4).toString('utf8')).toBe('%PDF');

    const downloadResponse = await page.request.get(resumeDownloadUrl ?? '');
    expect(downloadResponse.ok()).toBe(true);
    expect(downloadResponse.headers()['content-disposition']).toContain('attachment');
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});
