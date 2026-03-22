import { describe, expect, test } from 'vitest';

import { minimalAutofillProfileSchema } from '../../../packages/core/src/autofill-profile';
import {
  classifyApplicationQuestionLabel,
  resolveAutofillAnswer
} from '../../../packages/automation/src/apply/autofill-question-map';

describe('autofill question map', () => {
  test('classifies recurring Greenhouse-style labels', () => {
    expect(classifyApplicationQuestionLabel('U.S. WORK AUTHORIZATION*')).toBe('work_authorization');
    expect(
      classifyApplicationQuestionLabel('Will you require sponsorship from Acme now or in the future?*')
    ).toBe('sponsorship');
    expect(classifyApplicationQuestionLabel('Are you open to relocation for this role? *')).toBe('relocation');
    expect(classifyApplicationQuestionLabel('Gender')).toBe('voluntary_self_id');
  });

  test('resolves sponsorship and consent from minimal profile', () => {
    const base = minimalAutofillProfileSchema.parse({ requiresSponsorship: 'no' });
    const ctx = { autofill: base, summary: '', reusableContext: '' };
    expect(resolveAutofillAnswer('sponsorship', ctx)).toBe('No');
    expect(resolveAutofillAnswer('privacy_consent', ctx)).toBe('Yes');
    expect(resolveAutofillAnswer('voluntary_self_id', ctx)).toBeNull();
  });
});
