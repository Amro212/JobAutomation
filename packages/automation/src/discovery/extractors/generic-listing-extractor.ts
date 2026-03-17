import type { Page } from 'playwright';

import type {
  ExtractedPlaywrightJob,
  PlaywrightDiscoveryExtractor,
  PlaywrightExtractorContext
} from './base-extractor';

function canonicalizeUrl(value: string, baseUrl?: string): string {
  const parsed = baseUrl ? new URL(value, baseUrl) : new URL(value);
  parsed.hash = '';
  return parsed.toString();
}

function inferRemoteType(location: string, descriptionText: string): string {
  const haystack = `${location} ${descriptionText}`.toLowerCase();

  if (haystack.includes('hybrid')) {
    return 'hybrid';
  }

  if (haystack.includes('remote')) {
    return 'remote';
  }

  if (haystack.includes('on-site') || haystack.includes('onsite')) {
    return 'onsite';
  }

  return 'unknown';
}

function normalizeText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 0 ? normalized : null;
}

async function firstText(page: Page, selectors: string[]): Promise<string | null> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) {
      continue;
    }

    const text = normalizeText(await locator.textContent());
    if (text) {
      return text;
    }
  }

  return null;
}

async function collectAnchorUrls(page: Page, selector: string, sourcePageUrl: string): Promise<string[]> {
  const anchors = page.locator(selector);
  const count = await anchors.count();
  const urls: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const anchor = anchors.nth(index);
    const href = await anchor.getAttribute('href');
    if (!href) {
      continue;
    }

    const absoluteUrl = new URL(href, sourcePageUrl);
    if (absoluteUrl.protocol !== 'http:' && absoluteUrl.protocol !== 'https:') {
      continue;
    }

    absoluteUrl.hash = '';
    urls.push(absoluteUrl.toString());
  }

  return urls;
}

export class GenericListingExtractor implements PlaywrightDiscoveryExtractor {
  readonly id = 'generic-listing';

  async collectDetailPageUrls(page: Page, sourcePageUrl: string): Promise<string[]> {
    const selectors = [
      '[data-job-detail]',
      '[data-job-listings] a[href]',
      '[data-job-card] a[href]',
      'main a[href*="/jobs/"]',
      'main a[href*="/careers/"]',
      'main a[href*="/positions/"]',
      'main a[href*="/roles/"]'
    ];
    const currentUrl = canonicalizeUrl(sourcePageUrl);
    const discoveredUrls = new Set<string>();

    for (const selector of selectors) {
      const urls = await collectAnchorUrls(page, selector, sourcePageUrl);
      for (const url of urls) {
        const canonicalUrl = canonicalizeUrl(url, sourcePageUrl);
        if (canonicalUrl !== currentUrl) {
          discoveredUrls.add(canonicalUrl);
        }
      }
    }

    return [...discoveredUrls];
  }

  async extractJob(
    page: Page,
    context: PlaywrightExtractorContext
  ): Promise<ExtractedPlaywrightJob> {
    const sourceId = await firstText(page, ['[data-job-id]', '[data-posting-id]', '[data-job-id-value]']);
    const title = await firstText(page, ['[data-job-title]', 'main h1', 'article h1', 'h1']);
    const companyName = await firstText(page, [
      '[data-company-name]',
      '[data-job-company]',
      '[data-company]',
      '.company'
    ]);
    const location = normalizeText(
      await firstText(page, [
        '[data-job-location]',
        '[data-location]',
        '.location',
        '[itemprop="jobLocation"]'
      ])
    ) ?? '';
    const employmentType = await firstText(page, [
      '[data-employment-type]',
      '[data-job-type]',
      '.employment-type'
    ]);
    const compensationText = await firstText(page, [
      '[data-compensation]',
      '[data-salary]',
      '.compensation'
    ]);
    const descriptionText = normalizeText(
      await firstText(page, [
        '[data-job-description]',
        '[data-description]',
        'main article',
        'article',
        'main'
      ])
    ) ?? '';

    return {
      detailPageUrl: canonicalizeUrl(context.detailPageUrl, context.sourcePageUrl),
      sourceId,
      sourceUrl: canonicalizeUrl(context.detailPageUrl, context.sourcePageUrl),
      companyName: companyName ?? context.label,
      title,
      location,
      remoteType: inferRemoteType(location, descriptionText),
      employmentType,
      compensationText,
      descriptionText
    };
  }
}

export function createGenericListingExtractor(): PlaywrightDiscoveryExtractor {
  return new GenericListingExtractor();
}
