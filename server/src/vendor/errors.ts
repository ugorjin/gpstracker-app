import { PlatformStatus } from './constants.js';

/** The vendor API answered, but with a non-success status. */
export class VendorApiError extends Error {
  constructor(
    readonly action: string,
    readonly status: number,
    readonly cause_: string | undefined,
    readonly body: unknown,
  ) {
    super(`Vendor API action "${action}" failed with status ${status}${cause_ ? `: ${cause_}` : ''}`);
    this.name = 'VendorApiError';
  }

  get isTokenProblem(): boolean {
    return this.status === PlatformStatus.TOKEN_EXPIRED || this.status === PlatformStatus.TOKEN_NOT_FOUND;
  }

  /** Limits imposed by the vendor: retrying immediately will not help. */
  get isQuotaProblem(): boolean {
    return (
      this.status === PlatformStatus.IP_RATE_LIMITED ||
      this.status === PlatformStatus.ACCOUNT_RESTRICTED ||
      this.status === PlatformStatus.DAILY_QUOTA_EXHAUSTED
    );
  }
}

/** We refused to send the request because it would exceed our own budget. */
export class VendorBudgetExceededError extends Error {
  constructor(readonly kind: 'daily' | 'track', detail: string) {
    super(detail);
    this.name = 'VendorBudgetExceededError';
  }
}

/** Network failure, timeout, or a non-JSON / non-200 response. */
export class VendorTransportError extends Error {
  constructor(readonly action: string, message: string, options?: { cause?: unknown }) {
    super(`Vendor API action "${action}": ${message}`, options);
    this.name = 'VendorTransportError';
  }
}
