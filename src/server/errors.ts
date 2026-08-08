/**
 * Map thrown errors to HTTP status + stable JSON body.
 */

import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";
import { PermissionDeniedError } from "@/domain/rbac/authorize";
import { RbacRepoError } from "@/repo/rbac";
import { AdminUsersError } from "@/service/admin-users";
import { ControlError } from "@/service/control-errors";
import { EmployeeImportError } from "@/service/employee-import";
import { PayRunError } from "@/service/payrun";
import { AuthError } from "./auth/errors";

export interface ErrorBody {
  readonly code: string;
  readonly message: string;
}

const CONFLICT_MESSAGE = /already exists|duplicate|unique/i;

interface CodedHttpError {
  readonly code: string;
  readonly status: number;
  readonly message: string;
}

function asCodedHttpError(error: unknown): CodedHttpError | null {
  if (
    error instanceof AdminUsersError ||
    error instanceof EmployeeImportError ||
    error instanceof ControlError ||
    error instanceof PayRunError
  ) {
    return error;
  }
  return null;
}

export function errorStatus(error: unknown): {
  status: ContentfulStatusCode;
  body: ErrorBody;
} {
  if (error instanceof AuthError) {
    const status: ContentfulStatusCode =
      error.code === "UNAUTHORIZED" ? 401 : 403;
    return { status, body: { code: error.code, message: error.message } };
  }
  if (error instanceof PermissionDeniedError) {
    return {
      status: 403,
      body: { code: "PERMISSION_DENIED", message: error.message },
    };
  }
  const coded = asCodedHttpError(error);
  if (coded !== null) {
    return {
      status: coded.status as ContentfulStatusCode,
      body: { code: coded.code, message: coded.message },
    };
  }
  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        code: "VALIDATION_ERROR",
        message: error.issues.map((i) => i.message).join("; "),
      },
    };
  }
  if (error instanceof RbacRepoError) {
    if (CONFLICT_MESSAGE.test(error.message)) {
      return {
        status: 409,
        body: { code: "CONFLICT", message: error.message },
      };
    }
    return {
      status: 400,
      body: { code: "VALIDATION_ERROR", message: error.message },
    };
  }
  const message =
    error instanceof Error ? error.message : "Internal server error";
  return {
    status: 500,
    body: { code: "INTERNAL_ERROR", message },
  };
}

export function handleRouteError(c: Context, error: unknown): Response {
  const { status, body } = errorStatus(error);
  if (status >= 500) {
    console.error("api error", error);
  }
  return c.json(body, status);
}
