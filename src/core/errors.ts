export const EXIT = {
  OK: 0,
  UNEXPECTED: 1,
  VALIDATION: 2,
  AUTH: 3,
  ALL_FAILED: 4,
} as const;

export type ExitCodeValue = (typeof EXIT)[keyof typeof EXIT];

export class CliError extends Error {
  readonly code: string;
  readonly exitCode: ExitCodeValue;

  constructor(message: string, code: string, exitCode: ExitCodeValue) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.exitCode = exitCode;
  }
}

export class ValidationError extends CliError {
  constructor(message: string) {
    super(message, "VALIDATION", EXIT.VALIDATION);
    this.name = "ValidationError";
  }
}

export class AuthError extends CliError {
  retries = 0;

  constructor(message: string) {
    super(message, "AUTH", EXIT.AUTH);
    this.name = "AuthError";
  }
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  retries = 0;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code ?? `HTTP_${status}`;
  }
}

export class TimeoutError extends Error {
  readonly code = "TIMEOUT";
  retries = 0;

  constructor(seconds: number) {
    super(`request timed out after ${seconds}s`);
    this.name = "TimeoutError";
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function errorCode(err: unknown): string {
  if (err instanceof CliError) return err.code;
  if (err instanceof ApiError) return err.code;
  if (err instanceof TimeoutError) return err.code;
  return "UNEXPECTED";
}

export function errorRetries(err: unknown): number {
  if (err instanceof ApiError || err instanceof TimeoutError || err instanceof AuthError) return err.retries;
  return 0;
}
