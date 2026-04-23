import { parse, type HTMLElement } from 'node-html-parser';
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

type ParsedScrapeResult = {
  fields: ScrapedApplicationField[];
  ignoredFieldCount: number;
  groupedFieldCount: number;
  specialCases: string[];
};

type MutableField = ScrapedApplicationField;

const STAGE_3_LOG_PREFIX = '[Stage 3][field-scraper]';
const INTERACTIVE_SELECTOR = [
  'input:not([type="hidden"])',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
  '[role="textbox"]',
  '[role="combobox"]'
].join(', ');

function logStage3(action: string, details: Record<string, unknown>): void {
  console.log(`${STAGE_3_LOG_PREFIX} ${action} ${JSON.stringify(details)}`);
}

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
  const normalizedCandidates = candidates.map((candidate) => normalizeText(candidate)).filter(Boolean);
  const meaningfulCandidates = normalizedCandidates.filter((candidate) => !isGenericLabel(candidate));

  return meaningfulCandidates[0] ?? '';
}

function isElement(node: HTMLElement | null | undefined): node is HTMLElement {
  return Boolean(node);
}

function textWithoutInteractiveContent(element: HTMLElement | null): string {
  if (!element) {
    return '';
  }

  const clone = element.clone() as HTMLElement;
  if (clone.matches(INTERACTIVE_SELECTOR)) {
    return '';
  }

  for (const interactiveElement of clone.querySelectorAll(INTERACTIVE_SELECTOR)) {
    interactiveElement.remove();
  }

  return normalizeText(clone.textContent);
}

function readLabelElementText(label: HTMLElement | null): string {
  if (!label) {
    return '';
  }

  const fromChildren = chooseBestLabel(
    label.children
      .filter((child) => !child.matches(INTERACTIVE_SELECTOR) && !child.querySelector(INTERACTIVE_SELECTOR))
      .map((child) => textWithoutInteractiveContent(child))
  );
  if (fromChildren) {
    return fromChildren;
  }

  return textWithoutInteractiveContent(label);
}

function cssEscape(value: string): string {
  return value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

function isVisible(element: HTMLElement): boolean {
  if (element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') {
    return false;
  }

  const style = normalizeText(element.getAttribute('style'));
  if (/display\s*:\s*none/i.test(style) || /visibility\s*:\s*hidden/i.test(style)) {
    return false;
  }

  return true;
}

function isEnabled(element: HTMLElement): boolean {
  return !element.hasAttribute('disabled') && element.getAttribute('aria-disabled') !== 'true';
}

function readLabelledByText(documentRoot: HTMLElement, element: HTMLElement): string {
  const labelledBy = element.getAttribute('aria-labelledby');
  if (!labelledBy) {
    return '';
  }

  return normalizeText(
    labelledBy
      .split(/\s+/)
      .map((id) => documentRoot.querySelector(`#${cssEscape(id)}`))
      .filter(isElement)
      .map((node) => node.textContent)
      .join(' ')
  );
}

function findClosestLegend(element: HTMLElement): string {
  const fieldset = element.closest('fieldset');
  if (!fieldset) {
    return '';
  }

  return normalizeText(fieldset.querySelector('legend')?.textContent);
}

function findPromptFromPreviousSiblings(element: HTMLElement, rootElement: HTMLElement): string {
  let current: HTMLElement | null = element;
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

    current = current.parentNode ?? null;
    depth += 1;
  }

  return '';
}

function findContainerHeading(container: HTMLElement): string {
  for (const child of container.children) {
    if (child.matches(INTERACTIVE_SELECTOR) || child.querySelector(INTERACTIVE_SELECTOR)) {
      continue;
    }

    const childText = textWithoutInteractiveContent(child);
    if (childText && !isGenericLabel(childText)) {
      return childText;
    }
  }

  return '';
}

function findSharedAncestor(elementsToGroup: HTMLElement[], rootElement: HTMLElement): HTMLElement | null {
  const first = elementsToGroup[0];
  if (!first) {
    return null;
  }

  let candidate = first.parentNode ?? null;
  while (candidate && candidate !== rootElement.parentNode) {
    if (elementsToGroup.every((elementToGroup) => containsElement(candidate, elementToGroup))) {
      return candidate;
    }

    candidate = candidate.parentNode ?? null;
  }

  return null;
}

function containsElement(container: HTMLElement, target: HTMLElement): boolean {
  let current: HTMLElement | null = target;
  while (current) {
    if (current === container) {
      return true;
    }

    current = current.parentNode ?? null;
  }

  return false;
}

function hasMultipleDirectChoiceSubgroups(
  container: HTMLElement,
  inputType: 'radio' | 'checkbox'
): boolean {
  if (container.rawTagName.toLowerCase() === 'fieldset') {
    return false;
  }

  const nestedChoiceGroups = container
    .querySelectorAll('fieldset, [role="group"], [role="radiogroup"]')
    .filter((candidate) => {
      if (candidate === container) {
        return false;
      }

      const choiceInputs = candidate
        .querySelectorAll(`input[type="${inputType}"]`)
        .filter((input) => isVisible(input));
      return choiceInputs.length > 0;
    });
  if (nestedChoiceGroups.length > 1) {
    return true;
  }

  let subgroupCount = 0;
  for (const child of container.children) {
    const childChoiceInputs = child
      .querySelectorAll(`input[type="${inputType}"]`)
      .filter((candidate) => isVisible(candidate));
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
  documentRoot: HTMLElement,
  rootElement: HTMLElement,
  groupElements: HTMLElement[],
  startingContainer?: HTMLElement | null
): string {
  const first = groupElements[0];
  if (!first) {
    return '';
  }

  let current: HTMLElement | null = startingContainer ?? findSharedAncestor(groupElements, rootElement);
  while (current && current !== rootElement.parentNode) {
    const directLegend =
      current.rawTagName.toLowerCase() === 'fieldset'
        ? normalizeText(current.querySelector(':scope > legend')?.textContent)
        : '';
    if (directLegend) {
      return directLegend;
    }

    const labelledBy = readLabelledByText(documentRoot, current);
    if (labelledBy) {
      return labelledBy;
    }

    const ariaLabel = normalizeText(current.getAttribute('aria-label'));
    if (ariaLabel) {
      return ariaLabel;
    }

    if (current.rawTagName.toLowerCase() !== 'fieldset') {
      const promptFromSiblings = findPromptFromPreviousSiblings(current, rootElement);
      if (promptFromSiblings) {
        return promptFromSiblings;
      }
    }

    const containerHeading = findContainerHeading(current);
    if (containerHeading) {
      return containerHeading;
    }

    if (current.rawTagName.toLowerCase() === 'fieldset') {
      const promptFromSiblings = findPromptFromPreviousSiblings(current, rootElement);
      if (promptFromSiblings) {
        return promptFromSiblings;
      }
    }

    current = current.parentNode ?? null;
  }

  return '';
}

function hasNearbyInteractivePeer(element: HTMLElement, rootElement: HTMLElement): boolean {
  let current: HTMLElement | null = element.parentNode ?? null;
  let depth = 0;

  while (current && current !== rootElement && depth < 3) {
    const peers = current
      .querySelectorAll(INTERACTIVE_SELECTOR)
      .filter((candidate) => candidate !== element && isVisible(candidate));
    if (peers.length > 0) {
      return true;
    }

    current = current.parentNode ?? null;
    depth += 1;
  }

  return false;
}

function labelsForElement(documentRoot: HTMLElement, element: HTMLElement): HTMLElement[] {
  const id = element.getAttribute('id');
  if (!id) {
    return [];
  }

  return documentRoot.querySelectorAll(`label[for="${id.replace(/"/g, '\\"')}"]`);
}

function readAssociatedLabel(
  documentRoot: HTMLElement,
  rootElement: HTMLElement,
  element: HTMLElement
): string {
  const fromLabels = chooseBestLabel(labelsForElement(documentRoot, element).map(readLabelElementText));
  if (fromLabels) {
    return fromLabels;
  }

  const fromLabelledBy = readLabelledByText(documentRoot, element);
  if (fromLabelledBy) {
    return fromLabelledBy;
  }

  let current: HTMLElement | null = element.parentNode ?? null;
  let depth = 0;
  while (current && current !== rootElement && depth < 6) {
    if (current.rawTagName.toLowerCase() !== 'fieldset') {
      const promptFromSiblings = findPromptFromPreviousSiblings(current, rootElement);
      if (promptFromSiblings) {
        return promptFromSiblings;
      }
    }

    const containerHeading = findContainerHeading(current);
    if (containerHeading) {
      return containerHeading;
    }

    current = current.parentNode ?? null;
    depth += 1;
  }

  const fromNearbyPrompt = findPromptFromPreviousSiblings(element, rootElement);
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

function readChoiceOptionLabel(
  documentRoot: HTMLElement,
  rootElement: HTMLElement,
  element: HTMLElement
): string {
  const fromLabels = chooseBestLabel(labelsForElement(documentRoot, element).map(readLabelElementText));
  if (fromLabels) {
    return fromLabels;
  }

  const wrappingLabel = readLabelElementText(element.closest('label'));
  if (wrappingLabel && !isGenericLabel(wrappingLabel)) {
    return wrappingLabel;
  }

  const elementType = normalizeText(element.getAttribute('type'));
  let current: HTMLElement | null = element.parentNode ?? null;
  let depth = 0;
  while (current && current !== rootElement && depth < 4) {
    const optionText = textWithoutInteractiveContent(current);
    const sameTypeInputs = current
      .querySelectorAll(`input[type="${elementType}"]`)
      .filter((candidate) => isVisible(candidate));
    if (optionText && !isGenericLabel(optionText) && sameTypeInputs.length === 1) {
      return optionText;
    }

    current = current.parentNode ?? null;
    depth += 1;
  }

  return normalizeText(element.getAttribute('value'));
}

function findChoiceGroupContainer(rootElement: HTMLElement, element: HTMLElement): HTMLElement | null {
  const inputType = element.getAttribute('type') === 'radio' ? 'radio' : 'checkbox';
  let current: HTMLElement | null = element.parentNode ?? null;
  while (current && current !== rootElement) {
    const sameTypeInputs = current
      .querySelectorAll(`input[type="${inputType}"]`)
      .filter((candidate) => isVisible(candidate));
    if (sameTypeInputs.length > 1) {
      if (hasMultipleDirectChoiceSubgroups(current, inputType)) {
        current = current.parentNode ?? null;
        continue;
      }

      const hasGroupPrompt =
        Boolean(findContainerHeading(current)) ||
        Boolean(normalizeText(current.getAttribute('aria-label'))) ||
        Boolean(findPromptFromPreviousSiblings(current, rootElement));
      if (hasGroupPrompt) {
        return current;
      }
    }

    current = current.parentNode ?? null;
  }

  return null;
}

function findBroaderChoiceGroupContainer(
  rootElement: HTMLElement,
  element: HTMLElement,
  minimumInputCount: number
): HTMLElement | null {
  const inputType = element.getAttribute('type') === 'radio' ? 'radio' : 'checkbox';
  let current: HTMLElement | null = element.parentNode ?? null;
  while (current && current !== rootElement) {
    const sameTypeInputs = current
      .querySelectorAll(`input[type="${inputType}"]`)
      .filter((candidate) => isVisible(candidate));
    if (sameTypeInputs.length > minimumInputCount) {
      if (hasMultipleDirectChoiceSubgroups(current, inputType)) {
        current = current.parentNode ?? null;
        continue;
      }

      const hasGroupPrompt =
        Boolean(findContainerHeading(current)) ||
        Boolean(normalizeText(current.getAttribute('aria-label'))) ||
        Boolean(findPromptFromPreviousSiblings(current, rootElement));
      if (hasGroupPrompt) {
        return current;
      }
    }

    current = current.parentNode ?? null;
  }

  return null;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function selectorCandidatesForElement(element: HTMLElement): string[] {
  const candidates: string[] = [];
  const id = element.getAttribute('id');
  if (id) {
    candidates.push(`#${cssEscape(id)}`);
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

function inferInputType(element: HTMLElement): ScrapedApplicationFieldType {
  const tagName = element.rawTagName.toLowerCase();
  const contentEditable = element.getAttribute('contenteditable');

  if (tagName === 'textarea') {
    return 'textarea';
  }

  if (tagName === 'select') {
    return 'select';
  }

  if (contentEditable === 'true' || contentEditable === 'plaintext-only') {
    return 'rich_text';
  }

  if (hasComboboxHints(element)) {
    return 'combobox';
  }

  if (tagName !== 'input') {
    return 'rich_text';
  }

  switch (element.getAttribute('type')) {
    case 'email':
      return 'email';
    case 'tel':
      return 'tel';
    case 'file':
      return 'file';
    case 'checkbox':
      return 'checkbox';
    default:
      return 'text';
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

function hasComboboxHints(element: HTMLElement): boolean {
  const role = normalizeText(element.getAttribute('role')).toLowerCase();
  if (role === 'combobox') {
    return true;
  }

  const ariaAutocomplete = normalizeText(
    element.getAttribute('aria-autocomplete')
  ).toLowerCase();
  if (ariaAutocomplete === 'list' || ariaAutocomplete === 'both') {
    return true;
  }

  if (normalizeText(element.getAttribute('list'))) {
    return true;
  }

  const ariaControls = normalizeText(element.getAttribute('aria-controls'));
  const ariaHaspopup = normalizeText(
    element.getAttribute('aria-haspopup')
  ).toLowerCase();

  return Boolean(
    ariaControls &&
      (ariaAutocomplete.length > 0 ||
        ariaHaspopup === 'listbox' ||
        element.getAttribute('aria-expanded') !== null)
  );
}

function inferRequired(element: HTMLElement): boolean {
  return (
    element.hasAttribute('required') ||
    element.getAttribute('aria-required') === 'true' ||
    element.getAttribute('aria-invalid') === 'true'
  );
}

function collectSelectOptions(element: HTMLElement): ScrapedApplicationFieldOption[] {
  return element.querySelectorAll('option').map((option) => ({
    value: option.getAttribute('value') ?? '',
    label: normalizeText(option.textContent)
  }));
}

function fieldIdFromElement(element: HTMLElement, label: string): string {
  return (
    normalizeText(element.getAttribute('name')) ||
    normalizeText(element.getAttribute('id')) ||
    normalizeText(label).toLowerCase().replace(/[^a-z0-9]+/g, '_')
  );
}

function scrapeApplicationFieldsFromMarkup(input: {
  documentRoot: HTMLElement;
  rootElement: HTMLElement;
}): ParsedScrapeResult {
  const elements = input.rootElement.querySelectorAll(INTERACTIVE_SELECTOR).filter((element) => isVisible(element));
  const ignoredFieldCount = input.rootElement.querySelectorAll('input[type="hidden"]').length;
  const fields: MutableField[] = [];
  const groupedKeys = new Set<string>();
  const groupedContainers = new Set<HTMLElement>();
  let groupedFieldCount = 0;

  for (const element of elements) {
    const inputType = normalizeText(element.getAttribute('type'));
    if (inputType === 'radio' || inputType === 'checkbox') {
      const sameName = normalizeText(element.getAttribute('name'));
      const sameNamedGroup = sameName
        ? elements.filter(
            (candidate) =>
              candidate.rawTagName.toLowerCase() === 'input' &&
              normalizeText(candidate.getAttribute('type')) === inputType &&
              normalizeText(candidate.getAttribute('name')) === sameName
          )
        : [];
      const containerGroup =
        (sameNamedGroup.length > 1
          ? findBroaderChoiceGroupContainer(input.rootElement, element, sameNamedGroup.length)
          : null) ?? findChoiceGroupContainer(input.rootElement, element);
      const containerGroupedInputs =
        containerGroup?.querySelectorAll(`input[type="${inputType}"]`).filter((candidate) => isVisible(candidate)) ??
        [];
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
          const groupKey = `${inputType}:${sameName}`;
          if (groupedKeys.has(groupKey)) {
            continue;
          }

          groupedKeys.add(groupKey);
        }

        const groupType = inputType === 'radio' ? 'radio_group' : 'checkbox_group';
        const groupLabel =
          findGroupedFieldLabel(input.documentRoot, input.rootElement, groupedInputs, containerGroup) ||
          readAssociatedLabel(input.documentRoot, input.rootElement, element) ||
          sameName ||
          `${inputType} group`;
        const options = groupedInputs.map((option) => ({
          value: normalizeText(option.getAttribute('value')) || normalizeText(option.getAttribute('name')) || normalizeText(option.getAttribute('id')),
          label:
            readChoiceOptionLabel(input.documentRoot, input.rootElement, option) ||
            normalizeText(option.getAttribute('value'))
        }));

        fields.push({
          id: sameName || normalizeText(groupLabel).toLowerCase().replace(/[^a-z0-9]+/g, '_'),
          label: groupLabel,
          type: groupType,
          required: groupedInputs.some((option) => inferRequired(option)),
          visible: true,
          enabled: groupedInputs.some((option) => isEnabled(option)),
          selectorCandidates: uniqueStrings([
            ...groupedInputs
              .map((option) => normalizeText(option.getAttribute('name')))
              .filter(Boolean)
              .map((name) => `[name="${name.replace(/"/g, '\\"')}"]`),
            ...groupedInputs.flatMap((option) => selectorCandidatesForElement(option))
          ]),
          options
        });
        groupedFieldCount += 1;
        continue;
      }
    }

    const type = inferInputType(element);
    const label =
      readAssociatedLabel(input.documentRoot, input.rootElement, element) ||
      normalizeText(element.getAttribute('name')) ||
      type;
    const selectorCandidates = selectorCandidatesForElement(element);

    if (inputType === 'file' && selectorCandidates.length === 0) {
      continue;
    }

    if (selectorCandidates.length === 0 && (isGenericLabel(label) || hasNearbyInteractivePeer(element, input.rootElement))) {
      continue;
    }

    const options = type === 'select' ? collectSelectOptions(element) : [];
    const specialHandling = inferSpecialHandling(type);

    fields.push({
      id: fieldIdFromElement(element, label),
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
    groupedFieldCount,
    specialCases
  };
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

  const html = await input.page.content();
  const documentRoot = parse(html);
  const rootElement = documentRoot.querySelectorAll(input.boardEntry.rootSelector)[input.boardEntry.rootIndex] ?? null;
  if (!rootElement) {
    throw new Error('Application form scraper could not resolve the current form root from page markup.');
  }

  const result = scrapeApplicationFieldsFromMarkup({
    documentRoot,
    rootElement
  });

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
