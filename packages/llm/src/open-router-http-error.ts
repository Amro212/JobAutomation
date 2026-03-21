/**
 * Maps OpenRouter (and upstream model) HTTP status codes to short, actionable text.
 * Every message includes "(HTTP nnn)" so callers can detect specific codes if needed.
 */
export function formatOpenRouterHttpError(status: number, providerMessage?: string): string {
  const raw = providerMessage?.trim() ?? '';
  const useless = /^provider returned error\.?$/i.test(raw);
  const detail = raw && !useless ? ` ${raw}` : '';

  const line = (text: string) => `${text} (HTTP ${status}).${detail ? `${detail}` : ''}`;

  switch (status) {
    case 400:
      return line(
        'OpenRouter rejected the request—check the model name, JSON schema, and that the prompt is not malformed'
      );
    case 401:
      return line('OpenRouter authentication failed—verify OPENROUTER_API_KEY');
    case 402:
      return line(
        'OpenRouter or the upstream model requires payment or credits—add billing or credits on OpenRouter'
      );
    case 403:
      return line(
        'OpenRouter denied access—key may lack permission for this model or your account is restricted'
      );
    case 404:
      return line('OpenRouter endpoint or model was not found—check OPENROUTER_API_BASE_URL and model id');
    case 405:
    case 406:
      return line('OpenRouter refused this request method or format—try again or contact support');
    case 407:
      return line('Proxy authentication required—check network or proxy settings');
    case 408:
      return line('OpenRouter or upstream timed out waiting for the request—retry with a smaller prompt');
    case 409:
      return line('OpenRouter reported a conflict—retry the request');
    case 410:
      return line('Resource is gone—the model or route may have been removed');
    case 413:
      return line('Payload too large—shorten the job description, resume excerpt, or other prompt text');
    case 415:
      return line('Unsupported media type—this is a client configuration issue');
    case 422:
      return line('OpenRouter could not process the body—check schema and field types');
    case 424:
      return line('Upstream dependency failed—the model provider may be failing; retry later');
    case 425:
      return line('Request too early—retry after the indicated delay');
    case 426:
      return line('Upgrade required—protocol or TLS mismatch');
    case 428:
      return line('Precondition required—retry or check OpenRouter docs');
    case 429:
      return line(
        'Rate limited - please wait and retry, reduce how often you call the API, or switch to a less busy model'
      );
    case 431:
      return line('Request headers too large—reduce header size');
    case 451:
      return line('Unavailable for legal reasons');
    case 500:
      return line('OpenRouter or the model provider had an internal error—retry later');
    case 501:
      return line('Not implemented—this operation may not be supported for the chosen model');
    case 502:
      return line('Bad gateway—OpenRouter could not reach the model provider; retry later');
    case 503:
      return line(
        'Service unavailable—the model or OpenRouter is overloaded or in maintenance; retry later'
      );
    case 504:
      return line('Gateway timeout—the upstream model took too long; retry or use a smaller prompt');
    case 507:
      return line('Insufficient storage—provider-side issue; retry later');
    case 508:
      return line('Loop detected—provider-side issue');
    case 529:
      return line('Site overloaded—provider is saturated; retry after a delay');
    default:
      if (status >= 400 && status < 500) {
        return line('OpenRouter client error—check request, API key, and model settings');
      }
      if (status >= 500 && status < 600) {
        return line('OpenRouter or upstream server error—retry later');
      }
      return line('Unexpected response from OpenRouter');
  }
}
