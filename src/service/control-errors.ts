/** Shared domain errors for the control layer (gates / payments / release / close). */

export type ControlErrorCode =
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "GATE_BLOCKED"
  | "STALE_REVISION"
  | "SCAN_INCOMPLETE"
  | "VALIDATION_ERROR"
  | "CONFLICT";

function defaultStatusFor(code: ControlErrorCode): number {
  if (code === "NOT_FOUND") {
    return 404;
  }
  if (
    code === "GATE_BLOCKED" ||
    code === "INVALID_STATE" ||
    code === "STALE_REVISION" ||
    code === "SCAN_INCOMPLETE" ||
    code === "CONFLICT"
  ) {
    return 409;
  }
  return 400;
}

export class ControlError extends Error {
  readonly code: ControlErrorCode;
  readonly status: number;

  constructor(code: ControlErrorCode, message: string, status?: number) {
    super(message);
    this.name = "ControlError";
    this.code = code;
    this.status = status ?? defaultStatusFor(code);
  }
}
