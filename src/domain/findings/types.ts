/**
 * @feature findings
 * @layer domain
 *
 * Detected finding shapes before persistence.
 */

export type FindingSeverity = "INFO" | "REVIEW" | "WARNING" | "BLOCKING";

export type GateName = "REVIEW" | "APPROVAL" | "RELEASE" | "CLOSE";

export interface DetectedFinding {
  readonly ruleId: string;
  readonly severity: FindingSeverity;
  readonly blocks: readonly GateName[];
  readonly title: string;
  readonly detail: string;
  readonly evidence: Record<string, unknown>;
  readonly runId?: string | null;
  readonly transferId?: string | null;
  readonly lineId?: string | null;
}
