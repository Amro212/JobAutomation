import type {
  GenerateStructuredObjectInput,
  GenerateStructuredObjectResult
} from './provider';

export type HostedAiGatewayConfig = {
  baseUrl: string;
  authToken: string;
  fetchImpl?: typeof fetch;
};

export type HostedAiGatewayErrorCode =
  | 'auth_missing'
  | 'auth_failed'
  | 'subscription_required'
  | 'invalid_output'
  | 'provider_error';

export class HostedAiGatewayError extends Error {
  constructor(
    readonly code: HostedAiGatewayErrorCode,
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'HostedAiGatewayError';
  }
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function parseErrorCode(status: number): HostedAiGatewayErrorCode {
  if (status === 401 || status === 403) return 'auth_failed';
  if (status === 402) return 'subscription_required';
  return 'provider_error';
}

async function readGatewayMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: unknown };
    if (typeof payload.message === 'string' && payload.message.trim()) {
      return payload.message;
    }
  } catch {
    // Fall back below.
  }

  return `Hosted AI gateway request failed with status ${response.status}.`;
}

function parseGatewayPayload(payload: unknown): GenerateStructuredObjectResult {
  if (!payload || typeof payload !== 'object') {
    throw new HostedAiGatewayError(
      'invalid_output',
      'Hosted AI gateway returned an invalid response.'
    );
  }

  const record = payload as Record<string, unknown>;
  if (!('object' in record)) {
    throw new HostedAiGatewayError(
      'invalid_output',
      'Hosted AI gateway response did not include a structured object.'
    );
  }

  return {
    object: record.object,
    rawText: typeof record.rawText === 'string' ? record.rawText : JSON.stringify(record.object)
  };
}

export function createHostedAiGatewayProvider(config: HostedAiGatewayConfig) {
  const authToken = config.authToken.trim();
  if (!authToken) {
    throw new HostedAiGatewayError(
      'auth_missing',
      'Hosted AI gateway auth token is missing.'
    );
  }

  const endpoint = `${trimTrailingSlash(config.baseUrl)}/v1/structured-object`;
  const fetchImpl = config.fetchImpl ?? fetch;

  async function generateStructuredObjectWithMetadata(
    input: GenerateStructuredObjectInput
  ): Promise<GenerateStructuredObjectResult> {
    let response: Response;

    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify(input)
      });
    } catch (error) {
      throw new HostedAiGatewayError(
        'provider_error',
        error instanceof Error ? error.message : 'Hosted AI gateway transport error.'
      );
    }

    if (!response.ok) {
      throw new HostedAiGatewayError(
        parseErrorCode(response.status),
        await readGatewayMessage(response),
        response.status
      );
    }

    return parseGatewayPayload(await response.json());
  }

  return {
    generateStructuredObjectWithMetadata,
    async generateStructuredObject(input: GenerateStructuredObjectInput): Promise<unknown> {
      return (await generateStructuredObjectWithMetadata(input)).object;
    }
  };
}
