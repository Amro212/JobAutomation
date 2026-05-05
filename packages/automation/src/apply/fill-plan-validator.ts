import type { ApplicationArtifacts } from './contracts';
import type { ScrapedApplicationField, ScrapedApplicationFieldOption } from './form-scraper';
import type { ApplicationFillPlanEntry } from './openrouter-answer-module';
import {
  hasArtifactForRequiredFile,
  isFieldRequired,
  uploadArtifactKindForField
} from './field-contract';

export type ApplicationFillPlanMissingRequiredField = {
  fieldId: string;
  label: string;
  type: ScrapedApplicationField['type'];
  reason: string;
};

export type ApplicationFillPlanValidationResult = {
  ok: boolean;
  missingRequiredFields: ApplicationFillPlanMissingRequiredField[];
};

function exactOptionValue(
  options: ScrapedApplicationFieldOption[],
  candidate: string
): string | null {
  if (candidate.length === 0) {
    return null;
  }

  for (const option of options) {
    if (option.value === candidate || option.label === candidate) {
      return option.value;
    }
  }

  return null;
}

export function validateRequiredFillPlan(input: {
  fields: ScrapedApplicationField[];
  fillPlan: ApplicationFillPlanEntry[];
  artifacts?: ApplicationArtifacts;
}): ApplicationFillPlanValidationResult {
  const entryByFieldId = new Map(input.fillPlan.map((entry) => [entry.fieldId, entry]));
  const missingRequiredFields: ApplicationFillPlanMissingRequiredField[] = [];

  for (const field of input.fields) {
    const required = isFieldRequired(field);
    const entry = entryByFieldId.get(field.id);
    const selectorWithOptions =
      field.type === 'select' ||
      field.type === 'radio_group' ||
      field.type === 'checkbox_group' ||
      (field.type === 'combobox' &&
        (field.optionMode ?? (field.options.length > 0 ? 'static' : 'dynamic_search')) === 'static' &&
        field.options.length > 0);

    if (!required && (!selectorWithOptions || !entry || entry.action === 'skip')) {
      continue;
    }

    const addMissing = (reason: string) => {
      missingRequiredFields.push({
        fieldId: field.id,
        label: field.label,
        type: field.type,
        reason
      });
    };

    if (field.type === 'file') {
      if (!required) {
        continue;
      }

      const hasArtifact = hasArtifactForRequiredFile({
        field,
        ...(input.artifacts !== undefined ? { artifacts: input.artifacts } : {})
      });
      if (hasArtifact === false) {
        const kind = uploadArtifactKindForField(field);
        addMissing(kind ? `required_file_missing_artifact:${kind}` : 'required_file_missing_known_artifact_type');
      }
      continue;
    }

    if (!entry) {
      if (required) {
        addMissing('required_field_missing_from_fill_plan');
      }
      continue;
    }

    if (entry.action === 'skip') {
      if (required) {
        addMissing(entry.skipReason || 'required_field_was_skipped');
      }
      continue;
    }

    if (field.type === 'select' || field.type === 'radio_group') {
      const value = typeof entry.value === 'string' ? entry.value : '';
      if (!value || !exactOptionValue(field.options, value)) {
        addMissing(
          required
            ? 'required_selector_value_not_exact_available_option'
            : 'optional_selector_value_not_exact_available_option'
        );
      }
      continue;
    }

    if (field.type === 'checkbox_group') {
      const values = Array.isArray(entry.value)
        ? entry.value
        : typeof entry.value === 'string'
          ? [entry.value]
          : [];
      if (values.length === 0 || values.some((value) => !exactOptionValue(field.options, value))) {
        addMissing(
          required
            ? 'required_checkbox_group_missing_exact_options'
            : 'optional_checkbox_group_missing_exact_options'
        );
      }
      continue;
    }

    if (field.type === 'checkbox') {
      if (required && typeof entry.value !== 'boolean') {
        addMissing('required_checkbox_missing_boolean_value');
      }
      continue;
    }

    if (field.type === 'combobox') {
      const value = typeof entry.value === 'string' ? entry.value.trim() : '';
      const optionMode = field.optionMode ?? (field.options.length > 0 ? 'static' : 'dynamic_search');
      if (!value) {
        addMissing('required_combobox_missing_search_text');
        continue;
      }

      if (optionMode === 'static' && field.options.length > 0 && !exactOptionValue(field.options, value)) {
        addMissing(
          required
            ? 'required_combobox_value_not_exact_available_option'
            : 'optional_combobox_value_not_exact_available_option'
        );
      }
      continue;
    }

    if (required && (typeof entry.value !== 'string' || entry.value.trim().length === 0)) {
      addMissing('required_text_field_missing_value');
    }
  }

  return {
    ok: missingRequiredFields.length === 0,
    missingRequiredFields
  };
}
