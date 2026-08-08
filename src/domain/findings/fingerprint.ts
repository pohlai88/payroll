import { createHash } from "node:crypto";

/** Stable short fingerprint of evidence JSON (sorted keys). */
export function fingerprintOf(evidence: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(sortKeys(evidence)))
    .digest("hex")
    .slice(0, 12);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortKeys(obj[key]);
    }
    return out;
  }
  return value;
}
