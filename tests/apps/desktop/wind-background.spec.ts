import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
);

const windCss = readFileSync(
  path.join(
    workspaceRoot,
    'apps',
    'desktop',
    'renderer',
    'src',
    'components',
    'wind-background.css'
  ),
  'utf8'
);

const windPaths = [
  { className: 'wind-background__path--1', d: 'M-40 180 C 80 170, 140 190, 260 175 S 420 160, 520 178', length: 561.86 },
  { className: 'wind-background__path--2', d: 'M-20 320 C 120 300, 200 340, 340 310 S 500 290, 640 318', length: 665.14 },
  { className: 'wind-background__path--3', d: 'M60 90 C 180 110, 240 70, 360 95 S 480 120, 580 88', length: 526.2 },
  { className: 'wind-background__path--4', d: 'M120 420 C 220 400, 300 440, 400 415 S 520 395, 620 425', length: 506.17 },
  { className: 'wind-background__path--5', d: 'M200 250 C 280 230, 340 270, 420 248 S 500 225, 560 255', length: 368.15 },
  { className: 'wind-background__path--6', d: 'M-60 260 C 40 240, 100 280, 200 255 C 300 230, 380 275, 480 250 S 600 220, 700 265', length: 770.96 }
];

test('wind background paths use stroke-dash animation', async ({ page }) => {
  const pathMarkup = windPaths
    .map(
      (p, i) =>
        `<path id="wind-${i + 1}" class="wind-background__path ${p.className}" d="${p.d}" style="--path-length: ${p.length}" />`
    )
    .join('');

  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { margin: 0; background: #fff8f4; }
          ${windCss}
        </style>
      </head>
      <body>
        <div class="wind-background" data-testid="wind-background" style="--wind-stroke: #dbc1b5">
          <svg class="wind-background__svg" viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg">
            ${pathMarkup}
          </svg>
        </div>
      </body>
    </html>
  `);

  await expect(page.getByTestId('wind-background')).toBeVisible();

  const paths = page.locator('.wind-background__path');
  await expect(paths).toHaveCount(6);

  const firstDash = await paths.first().evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      strokeDasharray: style.strokeDasharray,
      strokeDashoffset: style.strokeDashoffset,
      animationName: style.animationName
    };
  });

  expect(firstDash.strokeDasharray).not.toBe('none');
  expect(Number.parseFloat(firstDash.strokeDashoffset)).toBeGreaterThan(0);
  expect(firstDash.animationName).toContain('wind-stroke-flow');

  await page.screenshot({
    path: path.join(workspaceRoot, 'test-results', 'wind-background-preview.png')
  });
});
