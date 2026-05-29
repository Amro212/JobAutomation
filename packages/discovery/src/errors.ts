export class InvalidDiscoverySourceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = 'InvalidDiscoverySourceError';
  }
}

export function isInvalidDiscoverySourceStatus(statusCode: number): boolean {
  return statusCode === 404 || statusCode === 410;
}

export function isInvalidDiscoverySourceError(error: unknown): error is InvalidDiscoverySourceError {
  return error instanceof InvalidDiscoverySourceError;
}
