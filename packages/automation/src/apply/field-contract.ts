import type { ApplicationArtifacts } from './contracts';

export type FieldRequiredSource =
  | 'html_required'
  | 'aria_required'
  | 'aria_invalid'
  | 'label_marker'
  | 'legend_marker'
  | 'nearby_required_text';

export type FieldOptionMode = 'none' | 'static' | 'dynamic_search';

export type FieldLikeForRequirement = {
  id: string;
  label: string;
  required: boolean;
  requiredSources?: FieldRequiredSource[];
};

export type FieldLikeForArtifacts = {
  id: string;
  label: string;
};

export function normalizeFieldText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

export function hasRequiredMarker(value: string | null | undefined): boolean {
  const normalized = normalizeFieldText(value);
  return /(^|\s|\b)[*✱](\s|\b|$)/.test(normalized) || /\brequired\b/i.test(normalized);
}

export function uniqueRequiredSources(values: FieldRequiredSource[]): FieldRequiredSource[] {
  return Array.from(new Set(values));
}

export function isFieldRequired(field: FieldLikeForRequirement): boolean {
  return field.required || (field.requiredSources?.length ?? 0) > 0 || hasRequiredMarker(field.label);
}

export function uploadArtifactKindForField(
  field: FieldLikeForArtifacts
): 'resume' | 'coverLetter' | null {
  const normalized = `${field.id} ${field.label}`.toLowerCase();

  if (/(resume|cv|curriculum vitae)/i.test(normalized)) {
    return 'resume';
  }

  if (/(cover[\s_-]*letter|coverletter)/i.test(normalized)) {
    return 'coverLetter';
  }

  return null;
}

export function hasArtifactForRequiredFile(input: {
  field: FieldLikeForArtifacts;
  artifacts?: ApplicationArtifacts;
}): boolean | null {
  if (input.artifacts === undefined) {
    return null;
  }

  const kind = uploadArtifactKindForField(input.field);
  if (!kind) {
    return false;
  }

  return Boolean(input.artifacts[kind]);
}
