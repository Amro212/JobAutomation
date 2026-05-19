import { parse, type HTMLElement } from 'node-html-parser';
import type { Locator, Page } from 'playwright';

import type { ApplicationBoardEntryResult } from './board-entry';
import {
  hasRequiredMarker,
  isFieldRequired,
  normalizeFieldText,
  uniqueRequiredSources,
  type FieldOptionMode,
  type FieldRequiredSource
} from './field-contract';

/** Bounds combobox probe waits so scrapes cannot hang multi-minute Playwright defaults. */
const SCRAPE_PROBE_ACTION_TIMEOUT_MS = 8500;
const COMBOBOX_STATIC_SCRAPE_WALL_CLOCK_MS = 45_000;

export type ScrapedApplicationFieldOption = {
  value: string;
  label: string;
  source?: 'native_option' | 'choice_input' | 'combobox_option';
  visible?: boolean;
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
  requiredSources?: FieldRequiredSource[];
  visible: boolean;
  enabled: boolean;
  selectorCandidates: string[];
  options: ScrapedApplicationFieldOption[];
  optionMode?: FieldOptionMode;
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
  return normalizeFieldText(value);
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

function containsDifferentChoiceNames(
  container: HTMLElement,
  inputType: 'radio' | 'checkbox',
  targetName: string
): boolean {
  if (!targetName) {
    return false;
  }

  const distinctNames = new Set(
    container
      .querySelectorAll(`input[type="${inputType}"]`)
      .filter((candidate) => isVisible(candidate))
      .map((candidate) => normalizeText(candidate.getAttribute('name')))
      .filter(Boolean)
  );

  return distinctNames.size > 1 || !distinctNames.has(targetName);
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
  const targetName = normalizeText(element.getAttribute('name'));
  let current: HTMLElement | null = element.parentNode ?? null;
  while (current && current !== rootElement) {
    const sameTypeInputs = current
      .querySelectorAll(`input[type="${inputType}"]`)
      .filter((candidate) => isVisible(candidate));
    if (sameTypeInputs.length > 1) {
      if (
        containsDifferentChoiceNames(current, inputType, targetName) ||
        hasMultipleDirectChoiceSubgroups(current, inputType)
      ) {
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
  const targetName = normalizeText(element.getAttribute('name'));
  let current: HTMLElement | null = element.parentNode ?? null;
  while (current && current !== rootElement) {
    const sameTypeInputs = current
      .querySelectorAll(`input[type="${inputType}"]`)
      .filter((candidate) => isVisible(candidate));
    if (sameTypeInputs.length > minimumInputCount) {
      if (
        containsDifferentChoiceNames(current, inputType, targetName) ||
        hasMultipleDirectChoiceSubgroups(current, inputType)
      ) {
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

function hasRequiredClassToken(value: string | null | undefined): boolean {
  const normalized = normalizeText(value).toLowerCase();
  return /(^|[_\-\s])required([_\-\s]|$)/.test(normalized);
}

function elementHasRequiredClassMarker(element: HTMLElement | null | undefined): boolean {
  if (!element) {
    return false;
  }

  return hasRequiredClassToken(element.getAttribute('class'));
}

function hasNearbyRequiredClassMarker(
  documentRoot: HTMLElement,
  element: HTMLElement,
  label: string
): boolean {
  const associatedLabels = labelsForElement(documentRoot, element);
  if (associatedLabels.some((candidate) => elementHasRequiredClassMarker(candidate))) {
    return true;
  }

  const wrappingLabel = element.closest('label');
  if (elementHasRequiredClassMarker(wrappingLabel)) {
    return true;
  }

  const nearestFieldContainer =
    element.closest(
      '[data-field-entry-id], [data-field-path], fieldset, .ashby-application-form-field-entry, ._fieldEntry_17tft_29'
    ) ?? element.closest('fieldset');
  if (elementHasRequiredClassMarker(nearestFieldContainer)) {
    return true;
  }

  if (nearestFieldContainer) {
    const normalizedLabel = normalizeText(label);
    const requiredNodes = nearestFieldContainer
      .querySelectorAll('[class*="required"], [class*="_required_"]')
      .filter((candidate) => elementHasRequiredClassMarker(candidate));
    for (const node of requiredNodes) {
      const nodeText = normalizeText(node.textContent);
      if (!normalizedLabel || nodeText.includes(normalizedLabel)) {
        return true;
      }
    }
  }

  let current: HTMLElement | null = element.parentNode ?? null;
  let depth = 0;
  while (current && current !== documentRoot && depth < 4) {
    if (elementHasRequiredClassMarker(current)) {
      return true;
    }

    current = current.parentNode ?? null;
    depth += 1;
  }

  return false;
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

  const fieldPath = normalizeText(element.closest('[data-field-path]')?.getAttribute('data-field-path'));
  if (fieldPath) {
    const escapedPath = fieldPath.replace(/"/g, '\\"');
    const tagName = element.rawTagName.toLowerCase();
    if (tagName === 'textarea') {
      candidates.push(`[data-field-path="${escapedPath}"] textarea`);
    } else if (tagName === 'input') {
      candidates.push(`[data-field-path="${escapedPath}"] input`);
    } else if (tagName === 'select') {
      candidates.push(`[data-field-path="${escapedPath}"] select`);
    } else {
      candidates.push(
        `[data-field-path="${escapedPath}"] [role="textbox"]`,
        `[data-field-path="${escapedPath}"] [contenteditable="true"]`
      );
    }
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

function inferRequiredSources(
  documentRoot: HTMLElement,
  element: HTMLElement,
  label: string
): FieldRequiredSource[] {
  const sources: FieldRequiredSource[] = [];
  if (element.hasAttribute('required')) {
    sources.push('html_required');
  }

  if (element.getAttribute('aria-required') === 'true') {
    sources.push('aria_required');
  }

  if (element.getAttribute('aria-invalid') === 'true') {
    sources.push('aria_invalid');
  }

  if (hasRequiredMarker(label)) {
    sources.push('label_marker');
  }

  const legend = findClosestLegend(element);
  if (hasRequiredMarker(legend)) {
    sources.push('legend_marker');
  }

  if (hasNearbyRequiredClassMarker(documentRoot, element, label)) {
    sources.push('nearby_required_text');
  }

  return uniqueRequiredSources(sources);
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
        const requiredSources = uniqueRequiredSources([
          ...(hasRequiredMarker(groupLabel) ? (['label_marker'] as FieldRequiredSource[]) : []),
          ...groupedInputs.flatMap((option) => inferRequiredSources(input.documentRoot, option, groupLabel))
        ]);

        fields.push({
          id: sameName || normalizeText(groupLabel).toLowerCase().replace(/[^a-z0-9]+/g, '_'),
          label: groupLabel,
          type: groupType,
          required: requiredSources.length > 0,
          visible: true,
          enabled: groupedInputs.some((option) => isEnabled(option)),
          selectorCandidates: uniqueStrings([
            ...groupedInputs
              .map((option) => normalizeText(option.getAttribute('name')))
              .filter(Boolean)
              .map((name) => `[name="${name.replace(/"/g, '\\"')}"]`),
            ...groupedInputs.flatMap((option) => selectorCandidatesForElement(option))
          ]),
          options,
          ...(requiredSources.length > 0 ? { requiredSources } : {})
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
    const requiredSources = inferRequiredSources(input.documentRoot, element, label);
    const optionMode: FieldOptionMode = type === 'combobox' ? 'dynamic_search' : 'none';

    fields.push({
      id: fieldIdFromElement(element, label),
      label,
      type,
      required: requiredSources.length > 0,
      visible: true,
      enabled: isEnabled(element),
      selectorCandidates,
      options,
      ...(requiredSources.length > 0 ? { requiredSources } : {}),
      ...(type === 'combobox' ? { optionMode } : {}),
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

async function firstAttachedFieldLocator(input: {
  page: Page;
  rootSelector: string;
  rootIndex: number;
  selectors: string[];
}) {
  const root = input.page.locator(input.rootSelector).nth(input.rootIndex);
  for (const selector of input.selectors) {
    const scoped = root.locator(selector).first();
    if ((await scoped.count().catch(() => 0)) > 0) {
      return scoped;
    }

    const pageLevel = input.page.locator(selector).first();
    if ((await pageLevel.count().catch(() => 0)) > 0) {
      return pageLevel;
    }
  }

  return null;
}

async function visibleRoleOptions(locator: Locator): Promise<ScrapedApplicationFieldOption[]> {
  const probeTimeout = { timeout: SCRAPE_PROBE_ACTION_TIMEOUT_MS } as const;
  const options: ScrapedApplicationFieldOption[] = [];
  const roleOptions = locator.getByRole('option');
  const count = Math.min(await roleOptions.count().catch(() => 0), 50);

  for (let index = 0; index < count; index += 1) {
    const option = roleOptions.nth(index);
    if (!(await option.isVisible(probeTimeout).catch(() => false))) {
      continue;
    }

    const label = normalizeText(await option.textContent().catch(() => ''));
    if (!label) {
      continue;
    }

    const value =
      normalizeText(await option.getAttribute('value').catch(() => null)) ||
      normalizeText(await option.getAttribute('data-value').catch(() => null)) ||
      label;
    options.push({
      value,
      label,
      source: 'combobox_option',
      visible: true
    });
  }

  return options;
}

function uniqueOptions(options: ScrapedApplicationFieldOption[]): ScrapedApplicationFieldOption[] {
  const seen = new Set<string>();
  const unique: ScrapedApplicationFieldOption[] = [];
  for (const option of options) {
    const key = `${normalizeText(option.value).toLowerCase()}\u0000${normalizeText(option.label).toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(option);
  }

  return unique;
}

async function dismissListboxOverlay(page: Page): Promise<void> {
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.waitForTimeout(80);
}

function isConsentPrivacyComboboxField(field: ScrapedApplicationField): boolean {
  const fingerprint = `${field.id} ${field.label}`.toLowerCase();
  return (
    fingerprint.includes('privacy') ||
    fingerprint.includes('acknowledge') ||
    fingerprint.includes('acknowledgement') ||
    fingerprint.includes('consent') ||
    fingerprint.includes('notice at collection') ||
    fingerprint.includes('notice-at-collection')
  );
}

function inferReactSelectListboxId(field: ScrapedApplicationField): string | null {
  const fieldId = normalizeText(field.id);
  if (!fieldId) {
    return null;
  }

  return `react-select-${fieldId}-listbox`;
}

async function collectLinkedListboxIds(
  field: ScrapedApplicationField,
  locator: Locator
): Promise<Set<string>> {
  const linkedIds = new Set<string>();
  const reactSelectId = inferReactSelectListboxId(field);
  if (reactSelectId) {
    linkedIds.add(reactSelectId);
  }

  for (const attribute of ['aria-controls', 'aria-owns', 'list']) {
    const value = normalizeText(await locator.getAttribute(attribute).catch(() => null));
    for (const id of value.split(/\s+/).map(normalizeText).filter(Boolean)) {
      linkedIds.add(id);
    }
  }

  return linkedIds;
}

async function waitForLinkedListboxVisible(input: {
  page: Page;
  linkedIds: Set<string>;
  timeoutMs: number;
}): Promise<string | null> {
  const deadline = Date.now() + input.timeoutMs;

  while (Date.now() <= deadline) {
    for (const id of input.linkedIds) {
      const listbox = input.page.locator(`#${cssEscape(id)}`);
      if (await listbox.count().catch(() => 0)) {
        const visible = await listbox.isVisible().catch(() => false);
        const hasOptions = await listbox
          .locator('[role="option"]')
          .count()
          .catch(() => 0);
        if (visible || hasOptions > 0) {
          return id;
        }
      }
    }

    await input.page.waitForTimeout(50);
  }

  return null;
}

async function scrapeOptionsFromListboxId(
  page: Page,
  listboxId: string
): Promise<ScrapedApplicationFieldOption[]> {
  const raw = await page
    .evaluate((id) => {
      const root = document.getElementById(id);
      if (!root) {
        return [] as Array<{ value: string; label: string }>;
      }

      return Array.from(root.querySelectorAll('[role="option"]'))
        .map((option) => {
          const label = (option.textContent ?? '').replace(/\s+/g, ' ').trim();
          const value =
            option.getAttribute('data-value')?.trim() ||
            option.getAttribute('value')?.trim() ||
            option.id?.trim() ||
            label;
          return { value, label };
        })
        .filter((option) => option.label.length > 0);
    }, listboxId)
    .catch(() => [] as Array<{ value: string; label: string }>);

  return raw.map((option) => ({
    value: option.value,
    label: option.label,
    source: 'combobox_option' as const,
    visible: true
  }));
}

async function openComboboxForOptionScrape(input: {
  page: Page;
  locator: Locator;
  linkedIds: Set<string>;
}): Promise<string | null> {
  await input.locator.scrollIntoViewIfNeeded({ timeout: SCRAPE_PROBE_ACTION_TIMEOUT_MS }).catch(() => undefined);
  await input.locator.click({ timeout: SCRAPE_PROBE_ACTION_TIMEOUT_MS }).catch(() => undefined);
  await input.locator.focus({ timeout: SCRAPE_PROBE_ACTION_TIMEOUT_MS }).catch(() => undefined);

  let openedListboxId = await waitForLinkedListboxVisible({
    page: input.page,
    linkedIds: input.linkedIds,
    timeoutMs: 2_000
  });

  if (!openedListboxId) {
    await input.locator.click({ timeout: SCRAPE_PROBE_ACTION_TIMEOUT_MS }).catch(() => undefined);
    await input.page.keyboard.press('ArrowDown').catch(() => undefined);
    openedListboxId = await waitForLinkedListboxVisible({
      page: input.page,
      linkedIds: input.linkedIds,
      timeoutMs: 1_000
    });
  }

  await input.page.waitForTimeout(150);
  return openedListboxId;
}

async function collectComboboxOptions(input: {
  page: Page;
  boardEntry: ApplicationBoardEntryResult;
  field: ScrapedApplicationField;
}): Promise<ScrapedApplicationFieldOption[]> {
  if (input.field.type !== 'combobox' || input.field.selectorCandidates.length === 0) {
    return [];
  }

  await dismissListboxOverlay(input.page);

  const locator = await firstAttachedFieldLocator({
    page: input.page,
    rootSelector: input.boardEntry.rootSelector,
    rootIndex: input.boardEntry.rootIndex,
    selectors: input.field.selectorCandidates
  });
  if (!locator) {
    return [];
  }

  const linkedIds = await collectLinkedListboxIds(input.field, locator);

  const openedListboxId = await openComboboxForOptionScrape({
    page: input.page,
    locator,
    linkedIds
  });

  const options: ScrapedApplicationFieldOption[] = [];
  const idsToScrape = openedListboxId ? [openedListboxId, ...linkedIds] : [...linkedIds];
  for (const id of idsToScrape) {
    options.push(...(await scrapeOptionsFromListboxId(input.page, id)));
    if (options.length > 0) {
      break;
    }

    options.push(
      ...(await visibleRoleOptions(input.page.locator(`#${cssEscape(id)}`)))
    );
    if (options.length > 0) {
      break;
    }
  }

  return uniqueOptions(options);
}

function isCountryComboboxSkippable(field: ScrapedApplicationField): boolean {
  const fingerprint = `${field.id} ${field.label}`.toLowerCase();

  // Explicit phone + country/code combination in field id/label
  const hasPhoneHint = fingerprint.includes('phone');
  const hasCountryCodeHint =
    fingerprint.includes('country') ||
    fingerprint.includes('code') ||
    fingerprint.includes('prefix') ||
    fingerprint.includes('dial');
  if (hasPhoneHint && hasCountryCodeHint) {
    return true;
  }

  // Check selector candidates for phone-related country code selectors
  // (e.g., Greenhouse uses selectors like [name="phone_country_code"])
  const selectorFingerprint = field.selectorCandidates.join(' ').toLowerCase();
  if (
    selectorFingerprint.includes('phone') &&
    (selectorFingerprint.includes('country') || selectorFingerprint.includes('code'))
  ) {
    return true;
  }

  // Standalone "Country" label combobox (Greenhouse phone country code pattern)
  // Country lists always have 200+ entries; dynamic_search is always correct.
  const normalizedLabel = field.label.replace(/[*✱\s]+$/g, '').trim().toLowerCase();
  if (normalizedLabel === 'country') {
    return true;
  }

  return false;
}

/** Prefer scraping options for required comboboxes before optional ones (expensive optional widgets shouldn't burn the wall clock). */
function comboboxFieldsInScrapePriorityOrder(fields: ScrapedApplicationField[]): ScrapedApplicationField[] {
  type Item = { field: ScrapedApplicationField; index: number };
  const items: Item[] = [];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (!field || field.type !== 'combobox') {
      continue;
    }
    items.push({ field, index });
  }

  items.sort((a, b) => {
    const consentA = isConsentPrivacyComboboxField(a.field);
    const consentB = isConsentPrivacyComboboxField(b.field);
    if (consentA !== consentB) {
      return consentA ? -1 : 1;
    }

    const reqA = isFieldRequired(a.field);
    const reqB = isFieldRequired(b.field);
    if (reqA !== reqB) {
      return reqA ? -1 : 1;
    }
    return a.index - b.index;
  });

  return items.map((entry) => entry.field);
}

async function enrichComboboxFields(input: {
  page: Page;
  boardEntry: ApplicationBoardEntryResult;
  fields: ScrapedApplicationField[];
}): Promise<ScrapedApplicationField[]> {
  const enrichedById = new Map<string, ScrapedApplicationField>();
  const scrapeDeadline = Date.now() + COMBOBOX_STATIC_SCRAPE_WALL_CLOCK_MS;
  const prioritizedComboBoxes = comboboxFieldsInScrapePriorityOrder(input.fields);

  for (const field of prioritizedComboBoxes) {
    if (isCountryComboboxSkippable(field)) {
      logStage3('skip_country_code_scrape', {
        label: field.label,
        id: field.id,
        reason: 'phone_country_code_combobox_detected'
      });
      enrichedById.set(field.id, {
        ...field,
        optionMode: 'dynamic_search'
      });
      continue;
    }

    if (Date.now() > scrapeDeadline) {
      logStage3('combobox_option_scrape_time_budget_hit', {
        label: field.label,
        id: field.id,
        deadlineMs: COMBOBOX_STATIC_SCRAPE_WALL_CLOCK_MS,
        note: 'skipping dropdown option scrape; planner will treat as dynamic_search'
      });
      enrichedById.set(field.id, {
        ...field,
        optionMode: 'dynamic_search'
      });
      continue;
    }

    const options = await collectComboboxOptions({
      page: input.page,
      boardEntry: input.boardEntry,
      field
    });
    if (options.length === 0) {
      logStage3('combobox_options_empty', {
        label: field.label,
        id: field.id,
        selectorCandidates: field.selectorCandidates
      });
      enrichedById.set(field.id, {
        ...field,
        optionMode: field.optionMode ?? 'dynamic_search'
      });
      continue;
    }

    logStage3('combobox_options_scraped', {
      label: field.label,
      id: field.id,
      optionCount: options.length,
      optionLabels: options.slice(0, 8).map((option) => option.label)
    });

    enrichedById.set(field.id, {
      ...field,
      options,
      optionMode: 'static'
    });
  }

  const enriched: ScrapedApplicationField[] = [];
  for (const field of input.fields) {
    if (field.type !== 'combobox') {
      enriched.push(field);
      continue;
    }

    enriched.push(enrichedById.get(field.id) ?? field);
  }

  return enriched;
}

export async function scrapeApplicationFields(input: {
  page: Page;
  boardEntry: ApplicationBoardEntryResult;
}): Promise<ScrapedApplicationField[]> {
  const PLAYWRIGHT_DEFAULT_ACTION_TIMEOUT_MS = 30_000;
  let restoreDefaultTimeout:
    | undefined
    | (() => void) = undefined;
  if (typeof input.page.setDefaultTimeout === 'function') {
    input.page.setDefaultTimeout(SCRAPE_PROBE_ACTION_TIMEOUT_MS);
    restoreDefaultTimeout = () => {
      input.page.setDefaultTimeout(PLAYWRIGHT_DEFAULT_ACTION_TIMEOUT_MS);
    };
  }

  try {
    return await scrapeApplicationFieldsUnsafe(input);
  } finally {
    restoreDefaultTimeout?.();
  }
}

async function scrapeApplicationFieldsUnsafe(input: {
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

  const fields = await enrichComboboxFields({
    page: input.page,
    boardEntry: input.boardEntry,
    fields: result.fields
  });

  if (fields.length === 0) {
    throw new Error('Application form scraper did not find any visible fields after readiness check.');
  }

  for (const field of fields) {
    logStage3('field_discovered', {
      label: field.label,
      type: field.type,
      required: field.required,
      requiredSources: field.requiredSources ?? [],
      selectorCandidates: field.selectorCandidates,
      optionMode: field.optionMode ?? 'none',
      optionCount: field.options.length
    });
  }

  logStage3('scrape_summary', {
    totalFields: fields.length,
    ignoredFieldCount: result.ignoredFieldCount,
    groupedFieldCount: result.groupedFieldCount,
    specialCases: result.specialCases
  });

  return fields;
}
