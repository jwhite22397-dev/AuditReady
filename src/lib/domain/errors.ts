export type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation"
  | "conflict"
  | "expired"
  | "rate_limited";

export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** User-facing message. Never returns stack traces or internal details. */
export function publicErrorMessage(error: unknown): string {
  if (isAppError(error)) return error.message;
  return "Something went wrong. Please try again.";
}
