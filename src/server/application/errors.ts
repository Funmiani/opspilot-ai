import "server-only";

export type ApplicationErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "DATABASE_UNAVAILABLE"
  | "INTERNAL_ERROR";
export type ValidationIssue = { field: string; message: string };

export class ApplicationError extends Error {
  readonly name = "ApplicationError";
  constructor(
    readonly code: ApplicationErrorCode,
    message: string,
    readonly issues?: ValidationIssue[],
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
