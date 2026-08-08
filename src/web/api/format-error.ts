/**
 * Single presentation formatter for API / auth client errors.
 */

import { ApiClientError } from "./types";

export function formatApiError(
  error: unknown,
  fallback = "Unknown error"
): string {
  if (error instanceof ApiClientError) {
    return `${error.code}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}
