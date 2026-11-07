export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Login required') => new HttpError(401, 'unauthorized', message);
export const forbidden = (message = 'You are not allowed to do this') => new HttpError(403, 'forbidden', message);
export const notFound = (what = 'Resource') => new HttpError(404, 'not_found', `${what} not found`);
export const conflict = (message: string) => new HttpError(409, 'conflict', message);
export const subscriptionExpired = () =>
  new HttpError(402, 'subscription_expired', 'The subscription for this device has expired. Please renew to continue.');
export const tooManyRequests = (message: string) => new HttpError(429, 'too_many_requests', message);
