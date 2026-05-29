type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function arrayLength(value: unknown): number | undefined {
  return Array.isArray(value) ? value.length : undefined;
}

function jsonLength(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  try {
    return JSON.stringify(value).length;
  } catch {
    return undefined;
  }
}

function copyIfPresent(
  target: JsonRecord,
  source: JsonRecord,
  keys: string[]
): void {
  for (const key of keys) {
    if (source[key] !== undefined) {
      target[key] = source[key];
    }
  }
}

function summarizeFields(fields: unknown): JsonRecord | undefined {
  if (!Array.isArray(fields)) {
    return undefined;
  }

  let requiredFieldCount = 0;
  let optionCount = 0;
  const typeCounts: Record<string, number> = {};
  for (const field of fields) {
    if (!isRecord(field)) {
      continue;
    }

    if (field.required === true) {
      requiredFieldCount += 1;
    }
    if (typeof field.type === 'string') {
      typeCounts[field.type] = (typeCounts[field.type] ?? 0) + 1;
    }
    optionCount += arrayLength(field.options) ?? 0;
  }

  return {
    scrapedFieldCount: fields.length,
    requiredFieldCount,
    optionCount,
    typeCounts
  };
}

function summarizePromptPayload(payload: unknown): JsonRecord | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const fields = Array.isArray(payload.fields) ? payload.fields : [];
  return {
    promptFieldCount: fields.length,
    promptPayloadLength: jsonLength(payload),
    promptOptionCount: fields.reduce((total, field) => {
      if (!isRecord(field)) {
        return total;
      }
      return total + (arrayLength(field.options) ?? 0);
    }, 0)
  };
}

export function summarizeApplicationEvidenceDetails(
  details: JsonRecord
): JsonRecord {
  const summary: JsonRecord = {};
  copyIfPresent(summary, details, [
    'applicationRunId',
    'siteKey',
    'step',
    'pageUrl',
    'profileDirectory',
    'promptVersion',
    'rawResponseLength',
    'repairRawResponseLength',
    'confirmationStatus',
    'confirmationMessage',
    'submitButtonSource',
    'verificationStatus',
    'verificationMessageId',
    'verificationSubject',
    'verificationCodeLength',
    'runTimings',
    'stageTimings'
  ]);

  if (isRecord(details.boardEntry)) {
    copyIfPresent(summary, details, ['boardEntry']);
  }

  const fieldSummary = summarizeFields(details.scrapedFields);
  if (fieldSummary) {
    Object.assign(summary, fieldSummary);
  }

  const promptSummary = summarizePromptPayload(details.promptPayload);
  if (promptSummary) {
    Object.assign(summary, promptSummary);
  }

  const repairPromptSummary = summarizePromptPayload(details.repairPromptPayload);
  if (repairPromptSummary) {
    summary.repairPrompt = repairPromptSummary;
  }

  if (Array.isArray(details.fillPlan)) {
    summary.fillPlanCount = details.fillPlan.length;
  }

  if (isRecord(details.fillPlanValidation)) {
    summary.fillPlanValidation = details.fillPlanValidation;
  }

  if (Array.isArray(details.missingRequiredFields)) {
    summary.missingRequiredFieldCount = details.missingRequiredFields.length;
    summary.missingRequiredFields = details.missingRequiredFields;
  }

  if (isRecord(details.executionResult)) {
    copyIfPresent(summary, details.executionResult, ['summary', 'telemetry']);
  }

  if (isRecord(details.preEntryWarmup)) {
    summary.preEntryWarmup = details.preEntryWarmup;
  }
  if (isRecord(details.preFillWarmup)) {
    summary.preFillWarmup = details.preFillWarmup;
  }
  if (isRecord(details.challengeSignal)) {
    summary.challengeSignal = details.challengeSignal;
  }

  if (typeof details.pageHtml === 'string') {
    summary.pageHtmlLength = details.pageHtml.length;
  }
  if (details.responseJson !== undefined) {
    summary.responseJsonLength = jsonLength(details.responseJson);
  }
  if (details.repairResponseJson !== undefined) {
    summary.repairResponseJsonLength = jsonLength(details.repairResponseJson);
  }
  if (details.fieldDiagnostics !== undefined) {
    summary.fieldDiagnosticsLength = jsonLength(details.fieldDiagnostics);
  }

  return summary;
}
