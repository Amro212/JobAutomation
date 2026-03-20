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

    await page.goto('/jobs');
    await page.getByLabel('Board label').fill('Acme Corp');
    await page.getByLabel('Source token or URL').fill('acme');
    await page.getByRole('button', { name: 'Add source' }).click();
    await page.getByRole('button', { name: 'Run now' }).click();

    await expect(page.getByRole('link', { name: 'Senior Platform Engineer' })).toBeVisible({
      timeout: 15000
    });
    await page.getByRole('link', { name: 'Senior Platform Engineer' }).click();

    await expect(page.getByRole('link', { name: 'View artifacts' })).toBeVisible();
    await page.getByRole('link', { name: 'View artifacts' }).click();

    await expect(page.getByRole('heading', { name: 'Resume and cover letter versions' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate tailored artifacts' })).toBeEnabled();

    await page.getByRole('button', { name: 'Generate tailored artifacts' }).click();
    await expect(page.getByText('Generated tailored resume and cover letter.')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'resume-variant' }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'cover-letter' }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'resume.tex' }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'cover-letter.tex' }).first()).toBeVisible();
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
