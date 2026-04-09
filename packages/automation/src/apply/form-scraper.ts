import type { Page } from 'playwright';

import type { ApplicationBoardEntryResult } from './board-entry';

export type ScrapedApplicationFieldOption = {
  value: string;
  label: string;
};

export type ScrapedApplicationFieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'checkbox_group'
  | 'radio_group'
  | 'file'
  | 'rich_text'
  | 'combobox';

export type ScrapedApplicationFieldSpecialHandling = 'file_upload' | 'rich_text';

export type ScrapedApplicationField = {
  id: string;
  label: string;
  type: ScrapedApplicationFieldType;
  required: boolean;
  visible: boolean;
  enabled: boolean;
  selectorCandidates: string[];
  options: ScrapedApplicationFieldOption[];
  specialHandling?: ScrapedApplicationFieldSpecialHandling;
};

type BrowserScrapeResult = {
  fields: ScrapedApplicationField[];
  ignoredFieldCount: number;
  groupedFieldCount: number;
  specialCases: string[];
};

const STAGE_3_LOG_PREFIX = '[Stage 3][field-scraper]';

// DEBUG: remove after Stage 3
function logStage3(action: string, details: Record<string, unknown>): void {
  console.log(`${STAGE_3_LOG_PREFIX} ${action} ${JSON.stringify(details)}`);
}

function scrapeApplicationFieldsInBrowser(rootElement: HTMLElement): BrowserScrapeResult {
  type MutableField = {
    id: string;
    label: string;
    type: ScrapedApplicationFieldType;
    required: boolean;
    visible: boolean;
    enabled: boolean;
    selectorCandidates: string[];
    options: ScrapedApplicationFieldOption[];
    specialHandling?: ScrapedApplicationFieldSpecialHandling;
  };

  const interactiveSelector = [
    'input:not([type="hidden"])',
    'textarea',
    'select',
    '[contenteditable="true"]',
    '[contenteditable="plaintext-only"]',
    '[role="textbox"]',
    '[role="combobox"]'
  ].join(', ');

  function normalizeText(value: string | null | undefined): string {
    return (value ?? '').replace(/\s+/g, ' ').trim();
  }

  function isGenericLabel(value: string): boolean {
    const normalized = normalizeText(value).toLowerCase();
    return (
      normalized === '' ||
      normalized === 'text' ||
      normalized === 'file' ||
      normalized === 'attach' ||
      /^[*✱]+$/.test(normalized)
    );
  }

  function chooseBestLabel(candidates: Array<string | null | undefined>): string {
    const normalizedCandidates = candidates
      .map((candidate) => normalizeText(candidate))
      .filter(Boolean);

    const meaningfulCandidates = normalizedCandidates.filter((candidate) => !isGenericLabel(candidate));
    if (meaningfulCandidates.length > 0) {
      return meaningfulCandidates[0] ?? '';
    }

    return '';
  }

  function textWithoutInteractiveContent(element: Element | null): string {
    if (!element) {
      return '';
    }

    const clone = element.cloneNode(true) as HTMLElement;
    if (clone.matches(interactiveSelector)) {
      return '';
    }

    for (const interactiveElement of Array.from(clone.querySelectorAll(interactiveSelector))) {
      interactiveElement.remove();
    }

    return normalizeText(clone.textContent);
  }

  function readLabelElementText(label: HTMLLabelElement | null): string {
    if (!label) {
      return '';
    }

    const fromChildren = chooseBestLabel(
      Array.from(label.children)
        .filter((child) => !child.matches(interactiveSelector) && !child.querySelector(interactiveSelector))
        .map((child) => textWithoutInteractiveContent(child))
    );
    if (fromChildren) {
      return fromChildren;
    }

    return textWithoutInteractiveContent(label);
  }

  function cssEscape(value: string): string {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(value);
    }

    return value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
  }

  function isVisible(element: Element): boolean {
    const htmlElement = element as HTMLElement;
    if (htmlElement.hidden) {
      return false;
    }

    const style = window.getComputedStyle(htmlElement);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }

    return htmlElement.getClientRects().length > 0;
  }

  function isEnabled(element: Element): boolean {
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLButtonElement
    ) {
      return !element.disabled;
    }

    return !element.hasAttribute('disabled') && element.getAttribute('aria-disabled') !== 'true';
  }

  function readLabelledByText(element: Element): string {
    const labelledBy = element.getAttribute('aria-labelledby');
    if (!labelledBy) {
      return '';
    }

    return normalizeText(
      labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id))
        .filter((node): node is HTMLElement => Boolean(node))
        .map((node) => node.innerText || node.textContent || '')
        .join(' ')
    );
  }

  function findClosestLegend(element: Element): string {
    const fieldset = element.closest('fieldset');
    if (!fieldset) {
      return '';
    }

    return normalizeText(fieldset.querySelector('legend')?.textContent);
  }

  function findPromptFromPreviousSiblings(element: Element): string {
    let current: Element | null = element;
    let depth = 0;

    while (current && current !== rootElement && depth < 8) {
      let sibling = current.previousElementSibling;

      while (sibling) {
        const siblingText = textWithoutInteractiveContent(sibling);
        if (siblingText && !isGenericLabel(siblingText)) {
          return siblingText;
        }

        sibling = sibling.previousElementSibling;
      }

      current = current.parentElement;
      depth += 1;
    }

    return '';
  }

  function findContainerHeading(container: Element): string {
    for (const child of Array.from(container.children)) {
      if (child.matches(interactiveSelector) || child.querySelector(interactiveSelector)) {
        continue;
      }

      const childText = textWithoutInteractiveContent(child);
      if (childText && !isGenericLabel(childText)) {
        return childText;
      }
    }

    return '';
  }

  function findSharedAncestor(elementsToGroup: Element[]): Element | null {
    const first = elementsToGroup[0];
    if (!first) {
      return null;
    }

    let candidate: Element | null = first.parentElement;
    while (candidate && candidate !== rootElement.parentElement) {
      if (elementsToGroup.every((elementToGroup) => candidate?.contains(elementToGroup))) {
        return candidate;
      }

      candidate = candidate.parentElement;
    }

    return null;
  }

  function hasMultipleDirectChoiceSubgroups(
    container: Element,
    inputType: 'radio' | 'checkbox'
  ): boolean {
    if (container instanceof HTMLFieldSetElement) {
      return false;
    }

    const nestedChoiceGroups = Array.from(
      container.querySelectorAll('fieldset, [role="group"], [role="radiogroup"]')
    ).filter((candidate) => {
      if (candidate === container) {
        return false;
      }

      const choiceInputs = Array.from(candidate.querySelectorAll(`input[type="${inputType}"]`)).filter(
        (input): input is HTMLInputElement => input instanceof HTMLInputElement && isVisible(input)
      );
      return choiceInputs.length > 0;
    });
    if (nestedChoiceGroups.length > 1) {
      return true;
    }

    let subgroupCount = 0;
    for (const child of Array.from(container.children)) {
      const childChoiceInputs = Array.from(child.querySelectorAll(`input[type="${inputType}"]`)).filter(
        (candidate): candidate is HTMLInputElement =>
          candidate instanceof HTMLInputElement && isVisible(candidate)
      );
      if (childChoiceInputs.length > 0) {
        subgroupCount += 1;
      }

      if (subgroupCount > 1) {
        return true;
      }
    }

    return false;
  }

  function findGroupedFieldLabel(
    groupElements: HTMLInputElement[],
    startingContainer?: Element | null
  ): string {
    const first = groupElements[0];
    if (!first) {
      return '';
    }

    let current: Element | null = startingContainer ?? findSharedAncestor(groupElements);
    while (current && current !== rootElement.parentElement) {
      const directLegend =
        current instanceof HTMLFieldSetElement
          ? normalizeText(current.querySelector(':scope > legend')?.textContent)
          : '';
      if (directLegend) {
        return directLegend;
      }

      const labelledBy = readLabelledByText(current);
      if (labelledBy) {
        return labelledBy;
      }

      const ariaLabel = normalizeText(current.getAttribute('aria-label'));
      if (ariaLabel) {
        return ariaLabel;
      }

      if (!(current instanceof HTMLFieldSetElement)) {
        const promptFromSiblings = findPromptFromPreviousSiblings(current);
        if (promptFromSiblings) {
          return promptFromSiblings;
        }
      }

      const containerHeading = findContainerHeading(current);
      if (containerHeading) {
        return containerHeading;
      }

      if (current instanceof HTMLFieldSetElement) {
        const promptFromSiblings = findPromptFromPreviousSiblings(current);
        if (promptFromSiblings) {
          return promptFromSiblings;
        }
      }

      current = current.parentElement;
    }

    return '';
  }

  function hasNearbyInteractivePeer(element: Element): boolean {
    let current: Element | null = element.parentElement;
    let depth = 0;

    while (current && current !== rootElement && depth < 3) {
      const peers = Array.from(current.querySelectorAll(interactiveSelector)).filter(
        (candidate) => candidate !== element && isVisible(candidate)
      );
      if (peers.length > 0) {
        return true;
      }

      current = current.parentElement;
      depth += 1;
    }

    return false;
  }

  function readAssociatedLabel(element: Element): string {
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
    ) {
      const fromLabels = chooseBestLabel(
        Array.from(element.labels ?? []).map((label) => readLabelElementText(label))
      );
      if (fromLabels) {
        return fromLabels;
      }
    }

    const fromLabelledBy = readLabelledByText(element);
    if (fromLabelledBy) {
      return fromLabelledBy;
    }

    let current: Element | null = element.parentElement;
    let depth = 0;
    while (current && current !== rootElement && depth < 6) {
      if (!(current instanceof HTMLFieldSetElement)) {
        const promptFromSiblings = findPromptFromPreviousSiblings(current);
        if (promptFromSiblings) {
          return promptFromSiblings;
        }
      }

      const containerHeading = findContainerHeading(current);
      if (containerHeading) {
        return containerHeading;
      }

      current = current.parentElement;
      depth += 1;
    }

    const fromNearbyPrompt = findPromptFromPreviousSiblings(element);
    if (fromNearbyPrompt) {
      return fromNearbyPrompt;
    }

    const wrappingLabel = readLabelElementText(element.closest('label'));
    if (wrappingLabel && !isGenericLabel(wrappingLabel)) {
      return wrappingLabel;
    }

    const ariaLabel = normalizeText(element.getAttribute('aria-label'));
    if (ariaLabel) {
      return ariaLabel;
    }

    const placeholder = normalizeText(element.getAttribute('placeholder'));
    if (placeholder) {
      return placeholder;
    }

    return findClosestLegend(element);
  }

  function readChoiceOptionLabel(element: HTMLInputElement): string {
    const fromLabels = chooseBestLabel(
      Array.from(element.labels ?? []).map((label) => readLabelElementText(label))
    );
    if (fromLabels) {
      return fromLabels;
    }

    const wrappingLabel = readLabelElementText(element.closest('label'));
    if (wrappingLabel && !isGenericLabel(wrappingLabel)) {
      return wrappingLabel;
    }

    let current: Element | null = element.parentElement;
    let depth = 0;
    while (current && current !== rootElement && depth < 4) {
      const optionText = textWithoutInteractiveContent(current);
      const sameTypeInputs = Array.from(current.querySelectorAll(`input[type="${element.type}"]`)).filter(
        (candidate): candidate is HTMLInputElement =>
          candidate instanceof HTMLInputElement && isVisible(candidate)
      );
      if (optionText && !isGenericLabel(optionText) && sameTypeInputs.length === 1) {
        return optionText;
      }

      current = current.parentElement;
      depth += 1;
    }

    return element.value;
  }

  function findChoiceGroupContainer(element: HTMLInputElement): Element | null {
    const inputType = element.type === 'radio' ? 'radio' : 'checkbox';
    let current: Element | null = element.parentElement;
    while (current && current !== rootElement) {
      const sameTypeInputs = Array.from(current.querySelectorAll(`input[type="${element.type}"]`)).filter(
        (candidate): candidate is HTMLInputElement =>
          candidate instanceof HTMLInputElement && isVisible(candidate)
      );
      if (sameTypeInputs.length > 1) {
        if (hasMultipleDirectChoiceSubgroups(current, inputType)) {
          current = current.parentElement;
          continue;
        }

        const hasGroupPrompt =
          Boolean(findContainerHeading(current)) ||
          Boolean(readLabelledByText(current)) ||
          Boolean(normalizeText(current.getAttribute('aria-label'))) ||
          Boolean(findPromptFromPreviousSiblings(current));
        if (hasGroupPrompt) {
          return current;
        }
      }

      current = current.parentElement;
    }

    return null;
  }

  function findBroaderChoiceGroupContainer(
    element: HTMLInputElement,
    minimumInputCount: number
  ): Element | null {
    const inputType = element.type === 'radio' ? 'radio' : 'checkbox';
    let current: Element | null = element.parentElement;
    while (current && current !== rootElement) {
      const sameTypeInputs = Array.from(current.querySelectorAll(`input[type="${element.type}"]`)).filter(
        (candidate): candidate is HTMLInputElement =>
          candidate instanceof HTMLInputElement && isVisible(candidate)
      );
      if (sameTypeInputs.length > minimumInputCount) {
        if (hasMultipleDirectChoiceSubgroups(current, inputType)) {
          current = current.parentElement;
          continue;
        }

        const hasGroupPrompt =
          Boolean(findContainerHeading(current)) ||
          Boolean(readLabelledByText(current)) ||
          Boolean(normalizeText(current.getAttribute('aria-label'))) ||
          Boolean(findPromptFromPreviousSiblings(current));
        if (hasGroupPrompt) {
          return current;
        }
      }

      current = current.parentElement;
    }

    return null;
  }

  function uniqueStrings(values: string[]): string[] {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function selectorCandidatesForElement(element: Element): string[] {
    const candidates: string[] = [];
    const htmlElement = element as HTMLElement;

    if (htmlElement.id) {
      candidates.push(`#${cssEscape(htmlElement.id)}`);
    }

    const name = element.getAttribute('name');
    if (name) {
      candidates.push(`[name="${name.replace(/"/g, '\\"')}"]`);
    }

    const dataTestId = element.getAttribute('data-testid');
    if (dataTestId) {
      candidates.push(`[data-testid="${dataTestId.replace(/"/g, '\\"')}"]`);
    }

    const dataQa = element.getAttribute('data-qa');
    if (dataQa) {
      candidates.push(`[data-qa="${dataQa.replace(/"/g, '\\"')}"]`);
    }

    const ariaLabel = normalizeText(element.getAttribute('aria-label'));
    if (ariaLabel) {
      candidates.push(`[aria-label="${ariaLabel.replace(/"/g, '\\"')}"]`);
    }

    const role = element.getAttribute('role');
    if (role) {
      candidates.push(`[role="${role.replace(/"/g, '\\"')}"]`);
    }

    return uniqueStrings(candidates);
  }

  function inferInputType(element: Element): ScrapedApplicationFieldType {
    if (element instanceof HTMLTextAreaElement) {
      return 'textarea';
    }

    if (element instanceof HTMLSelectElement) {
      return 'select';
    }

    const contentEditable = element.getAttribute('contenteditable');
    if (contentEditable === 'true' || contentEditable === 'plaintext-only') {
      return 'rich_text';
    }

    if (!(element instanceof HTMLInputElement)) {
      if (element.getAttribute('role') === 'combobox') {
        return 'combobox';
      }

      return 'rich_text';
    }

    switch (element.type) {
      case 'email':
        return 'email';
      case 'tel':
        return 'tel';
      case 'file':
        return 'file';
      case 'checkbox':
        return 'checkbox';
      default:
        return element.getAttribute('role') === 'combobox' ? 'combobox' : 'text';
    }
  }

  function inferSpecialHandling(
    type: ScrapedApplicationFieldType
  ): ScrapedApplicationFieldSpecialHandling | undefined {
    if (type === 'file') {
      return 'file_upload';
    }

    if (type === 'rich_text') {
      return 'rich_text';
    }

    return undefined;
  }

  function inferRequired(element: Element): boolean {
    return (
      element.hasAttribute('required') ||
      element.getAttribute('aria-required') === 'true' ||
      element.getAttribute('aria-invalid') === 'true'
    );
  }

  const elements = Array.from(rootElement.querySelectorAll(interactiveSelector)).filter((element) =>
    isVisible(element)
  );

  const ignoredFieldCount = Array.from(rootElement.querySelectorAll('input[type="hidden"]')).length;
  const fields: MutableField[] = [];
  const groupedKeys = new Set<string>();
  const groupedContainers = new Set<Element>();

  for (const element of elements) {
    if (!(element instanceof HTMLElement)) {
      continue;
    }

    if (element instanceof HTMLInputElement && (element.type === 'radio' || element.type === 'checkbox')) {
      const sameName = normalizeText(element.name);
      const sameNamedGroup = sameName
        ? elements.filter(
            (candidate): candidate is HTMLInputElement =>
              candidate instanceof HTMLInputElement &&
              candidate.type === element.type &&
              candidate.name === element.name
          )
        : [];
      const containerGroup =
        (sameNamedGroup.length > 1
          ? findBroaderChoiceGroupContainer(element, sameNamedGroup.length)
          : null) ?? findChoiceGroupContainer(element);
      const containerGroupedInputs = containerGroup
        ? Array.from(containerGroup.querySelectorAll(`input[type="${element.type}"]`)).filter(
            (candidate): candidate is HTMLInputElement =>
              candidate instanceof HTMLInputElement && isVisible(candidate)
          )
        : [];
      const groupedInputs =
        containerGroupedInputs.length > 1
          ? containerGroupedInputs
          : sameNamedGroup.length > 1
            ? sameNamedGroup
            : [];
      const shouldGroup = groupedInputs.length > 1;

      if (shouldGroup) {
        if (containerGroup) {
          if (groupedContainers.has(containerGroup)) {
            continue;
          }

          groupedContainers.add(containerGroup);
        } else {
          const groupKey = `${element.type}:${sameName}`;
          if (groupedKeys.has(groupKey)) {
            continue;
          }

          groupedKeys.add(groupKey);
        }
        const groupType = element.type === 'radio' ? 'radio_group' : 'checkbox_group';
        const groupLabel =
          findGroupedFieldLabel(groupedInputs, containerGroup) ||
          readAssociatedLabel(element) ||
          normalizeText(element.name) ||
          `${element.type} group`;
        const options = groupedInputs.map((option) => ({
          value: option.value || normalizeText(option.name) || normalizeText(option.id),
          label: readChoiceOptionLabel(option) || option.value
        }));
        const specialHandling = inferSpecialHandling(groupType);

        fields.push({
          id: sameName || normalizeText(groupLabel).toLowerCase().replace(/[^a-z0-9]+/g, '_'),
          label: groupLabel,
          type: groupType,
          required: groupedInputs.some((option) => inferRequired(option)),
          visible: true,
          enabled: groupedInputs.some((option) => isEnabled(option)),
          selectorCandidates: uniqueStrings([
            ...(groupedInputs
              .map((option) => normalizeText(option.name))
              .filter(Boolean)
              .map((name) => `[name="${name.replace(/"/g, '\\"')}"]`)),
            ...groupedInputs.flatMap((option) => selectorCandidatesForElement(option))
          ]),
          options,
          ...(specialHandling ? { specialHandling } : {})
        });
        continue;
      }
    }

    const type = inferInputType(element);
    const label = readAssociatedLabel(element) || normalizeText(element.getAttribute('name')) || type;
    const selectorCandidates = selectorCandidatesForElement(element);

    if (element instanceof HTMLInputElement && element.type === 'file' && selectorCandidates.length === 0) {
      continue;
    }

    if (selectorCandidates.length === 0 && (isGenericLabel(label) || hasNearbyInteractivePeer(element))) {
      continue;
    }

    const options =
      element instanceof HTMLSelectElement
        ? Array.from(element.options).map((option) => ({
            value: option.value,
            label: normalizeText(option.textContent)
          }))
        : [];
    const specialHandling = inferSpecialHandling(type);

    fields.push({
      id:
        normalizeText(element.getAttribute('name')) ||
        normalizeText((element as HTMLElement).id) ||
        normalizeText(label).toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      label,
      type,
      required: inferRequired(element),
      visible: true,
      enabled: isEnabled(element),
      selectorCandidates,
      options,
      ...(specialHandling ? { specialHandling } : {})
    });
  }

  const specialCases = fields
    .filter((field) => field.specialHandling)
    .map((field) => `${field.label}:${field.specialHandling}`);

  return {
    fields,
    ignoredFieldCount,
    groupedFieldCount: groupedKeys.size,
    specialCases
  };
}

function getBrowserScraperSource(): string {
  return scrapeApplicationFieldsInBrowser
    .toString()
    .replace(/__name\([^;]+;\s*/g, '');
}

export async function scrapeApplicationFields(input: {
  page: Page;
  boardEntry: ApplicationBoardEntryResult;
}): Promise<ScrapedApplicationField[]> {
  const root = input.page.locator(input.boardEntry.rootSelector).nth(input.boardEntry.rootIndex);
  const rootVisible = await root.isVisible().catch(() => false);

  if (!rootVisible) {
    throw new Error(
      `Application form root ${input.boardEntry.rootSelector}#${input.boardEntry.rootIndex} is no longer visible.`
    );
  }

  logStage3('scrape_start', {
    board: input.boardEntry.board,
    rootSelector: input.boardEntry.rootSelector,
    rootIndex: input.boardEntry.rootIndex,
    finalUrl: input.boardEntry.finalUrl
  });

  const browserScraperSource = getBrowserScraperSource();

  const result = await root.evaluate<BrowserScrapeResult, string>(
    (rootElement, source) => {
      if (!(rootElement instanceof HTMLElement)) {
        throw new Error('Application scraper expected an HTMLElement form root.');
      }

      const browserScrape = globalThis.eval(`(${source})`) as (
        rootNode: HTMLElement
      ) => BrowserScrapeResult;

      return browserScrape(rootElement);
    },
    browserScraperSource
  );

  if (result.fields.length === 0) {
    throw new Error('Application form scraper did not find any visible fields after readiness check.');
  }

  for (const field of result.fields) {
    logStage3('field_discovered', {
      label: field.label,
      type: field.type,
      required: field.required,
      selectorCandidates: field.selectorCandidates
    });
  }

  logStage3('scrape_summary', {
    totalFields: result.fields.length,
    ignoredFieldCount: result.ignoredFieldCount,
    groupedFieldCount: result.groupedFieldCount,
    specialCases: result.specialCases
  });

  return result.fields;
}
