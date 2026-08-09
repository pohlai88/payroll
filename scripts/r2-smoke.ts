/**
 * @feature artifacts
 * @layer spine
 *
 * One-shot R2 smoke: put → get → delete against configured .env.local.
 * Usage: npx tsx scripts/r2-smoke.ts
 */

import { createHash, randomUUID } from "node:crypto";
import { createR2Store } from "@/domain/artifacts/r2-store";
import { requireServerEnv } from "@/server/env";
import { loadEnvLocal } from "@/server/load-env-local";

loadEnvLocal();
const env = requireServerEnv();
if (env.r2 === null) {
  console.error("FAIL: R2 env not configured (need all five R2_* keys)");
  process.exit(1);
}

const store = createR2Store(env.r2);
const id = randomUUID();
const key = `runs/r2-smoke/${id}/probe.txt`;
const body = new TextEncoder().encode(`r2-smoke ${id}`);
const sha = createHash("sha256").update(body).digest("hex");

console.log(`bucket=${env.r2.bucket}`);
console.log(`endpoint=${env.r2.endpoint}`);
console.log(`key=${key}`);

await store.put({ key, body, contentType: "text/plain" });
console.log("put=ok");

const got = await store.get(key);
if (got === null) {
  console.error("FAIL: get returned null after put");
  process.exit(1);
}
const gotSha = createHash("sha256").update(got).digest("hex");
if (gotSha !== sha || got.byteLength !== body.byteLength) {
  console.error("FAIL: get body/hash mismatch");
  process.exit(1);
}
console.log(`get=ok bytes=${got.byteLength} sha256=${gotSha.slice(0, 12)}…`);

await store.delete(key);
const after = await store.get(key);
if (after !== null) {
  console.error("FAIL: object still present after delete");
  process.exit(1);
}
console.log("delete=ok");
console.log("PASS: R2 put/get/delete validated");
