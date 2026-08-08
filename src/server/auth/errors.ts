/**
 * Auth-platform failures with stable `code` values for the HTTP error map.
 */

export type AuthErrorCode =
  | "UNAUTHORIZED"
  | "INVITE_REQUIRED"
  | "AUTH_SUBJECT_CONFLICT"
  | "AUTH_BANNED"
  | "USER_DISABLED";

export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AuthError";
    this.code = code;
  }
}
