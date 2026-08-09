/**
 * @feature control
 * @layer test
 *
 * TSA client behaviour, against real DigiCert replies served offline.
 *
 * The client's job is not to trust the authority: it must prove the token it
 * got back is a token for the hash it asked about, in answer to the request it
 * just made. Both fixtures are genuine replies captured from
 * http://timestamp.digicert.com.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { requestTimestamp } from "@/domain/timestamp/client";
import { buildTimeStampRequest } from "@/domain/timestamp/rfc3161";

const FIXTURE_HASH =
  "906bded9cf3a4777f15b1814177b3aa874633d8d01219e19c789b8fa1497f9b8";
const FIXTURE_NONCE = Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8);
const TSA_URL = "http://timestamp.digicert.com";

function fixture(name: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(
    readFileSync(path.resolve(import.meta.dirname, "../fixtures", name))
  );
}

const NONCE_REPLY = fixture("digicert-timestamp-nonce.tsr");

interface Captured {
  readonly url: string;
  readonly init: RequestInit;
}

function replyWith(
  body: Uint8Array<ArrayBuffer>,
  status = 200
): { fetchImpl: typeof fetch; calls: Captured[] } {
  const calls: Captured[] = [];
  const fetchImpl = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(new Response(body, { status }));
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("requestTimestamp", () => {
  it("posts a DER request as application/timestamp-query", async () => {
    const { fetchImpl, calls } = replyWith(NONCE_REPLY);

    await requestTimestamp({
      url: TSA_URL,
      hashHex: FIXTURE_HASH,
      fetchImpl,
      generateNonce: () => FIXTURE_NONCE,
    });

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe(TSA_URL);
    expect(call?.init.method).toBe("POST");
    expect(new Headers(call?.init.headers).get("content-type")).toBe(
      "application/timestamp-query"
    );
    expect(Buffer.from(call?.init.body as Uint8Array)).toEqual(
      Buffer.from(
        buildTimeStampRequest({ hashHex: FIXTURE_HASH, nonce: FIXTURE_NONCE })
      )
    );
  });

  it("returns the token, its genTime and the authority it came from", async () => {
    const { fetchImpl } = replyWith(NONCE_REPLY);

    const result = await requestTimestamp({
      url: TSA_URL,
      hashHex: FIXTURE_HASH,
      fetchImpl,
      generateNonce: () => FIXTURE_NONCE,
    });

    expect(result.tsaUrl).toBe(TSA_URL);
    expect(result.token.length).toBeGreaterThan(1000);
    expect(result.genTime.getTime()).toBeGreaterThan(
      Date.parse("2026-08-01T00:00:00Z")
    );
    expect(result.serialNumber).toMatch(/^[0-9a-f]+$/);
  });

  it("keeps the whole reply, which is what `openssl ts -verify` reads", async () => {
    const { fetchImpl } = replyWith(NONCE_REPLY);

    const result = await requestTimestamp({
      url: TSA_URL,
      hashHex: FIXTURE_HASH,
      fetchImpl,
      generateNonce: () => FIXTURE_NONCE,
    });

    expect(Buffer.from(result.reply)).toEqual(Buffer.from(NONCE_REPLY));
    expect(result.reply.length).toBeGreaterThan(result.token.length);
  });

  it("refuses a token stamped over a different hash", async () => {
    const { fetchImpl } = replyWith(NONCE_REPLY);

    await expect(
      requestTimestamp({
        url: TSA_URL,
        hashHex: "b".repeat(64),
        fetchImpl,
        generateNonce: () => FIXTURE_NONCE,
      })
    ).rejects.toThrow(/imprint/i);
  });

  it("refuses a token that echoes a different nonce", async () => {
    const { fetchImpl } = replyWith(NONCE_REPLY);

    await expect(
      requestTimestamp({
        url: TSA_URL,
        hashHex: FIXTURE_HASH,
        fetchImpl,
        generateNonce: () => Uint8Array.of(9, 9, 9, 9, 9, 9, 9, 9),
      })
    ).rejects.toThrow(/nonce/i);
  });

  it("fails when the authority answers with an HTTP error", async () => {
    const { fetchImpl } = replyWith(new Uint8Array(), 503);

    await expect(
      requestTimestamp({ url: TSA_URL, hashHex: FIXTURE_HASH, fetchImpl })
    ).rejects.toThrow(/503/);
  });

  it("gives up on an authority that never answers", async () => {
    const fetchImpl = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new Error("aborted"))
        );
      })) as unknown as typeof fetch;

    await expect(
      requestTimestamp({
        url: TSA_URL,
        hashHex: FIXTURE_HASH,
        fetchImpl,
        timeoutMs: 10,
      })
    ).rejects.toThrow(/abort/i);
  });
});
