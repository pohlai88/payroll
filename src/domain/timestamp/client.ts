/**
 * Asks a Time Stamp Authority to sign a hash, and checks the answer.
 *
 * The transport is plain HTTP by design: the token is a signed CMS structure,
 * so TLS would add nothing a tampered reply could not survive anyway. What
 * makes the reply trustworthy is the check below — same imprint, same nonce —
 * plus the authority's own signature, which stays with the stored bytes.
 */

import { randomBytes } from "node:crypto";

import { buildTimeStampRequest, parseTimeStampResponse } from "./rfc3161";

const NONCE_BYTES = 8;
const DEFAULT_TIMEOUT_MS = 10_000;
const TIMESTAMP_QUERY = "application/timestamp-query";
/** DER INTEGER padding is not part of the nonce's identity. */
const LEADING_ZEROS = /^0+/;

export interface TimestampResult {
  /** The authority that issued it, recorded alongside the token. */
  readonly tsaUrl: string;
  /**
   * The whole TimeStampResp. This is the archival artifact: `openssl ts
   * -verify -in <file> -data <file>` reads a response, not a bare token.
   */
  readonly reply: Uint8Array;
  /** DER ContentInfo, for callers that embed a token in a document. */
  readonly token: Uint8Array;
  readonly genTime: Date;
  readonly serialNumber: string;
  readonly policyOid: string;
}

export interface RequestTimestampOptions {
  readonly url: string;
  readonly hashHex: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
  readonly generateNonce?: () => Uint8Array;
}

export async function requestTimestamp(
  options: RequestTimestampOptions
): Promise<TimestampResult> {
  const {
    url,
    hashHex,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = fetch,
    generateNonce = () => new Uint8Array(randomBytes(NONCE_BYTES)),
  } = options;

  const nonce = generateNonce();
  const request = buildTimeStampRequest({ hashHex, nonce });

  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": TIMESTAMP_QUERY },
    body: request,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(
      `timestamp authority ${url} answered HTTP ${response.status}`
    );
  }

  const reply = new Uint8Array(await response.arrayBuffer());
  const parsed = parseTimeStampResponse(reply);

  if (parsed.messageImprintHex.toLowerCase() !== hashHex.toLowerCase()) {
    throw new Error(
      `timestamp authority ${url} stamped the wrong imprint: asked for ${hashHex}, got ${parsed.messageImprintHex}`
    );
  }

  const sentNonce = Buffer.from(nonce)
    .toString("hex")
    .replace(LEADING_ZEROS, "");
  const echoed = parsed.nonceHex?.replace(LEADING_ZEROS, "") ?? null;
  if (echoed !== sentNonce) {
    throw new Error(
      `timestamp authority ${url} echoed nonce ${echoed ?? "none"}, expected ${sentNonce}`
    );
  }

  return {
    tsaUrl: url,
    reply,
    token: parsed.token,
    genTime: parsed.genTime,
    serialNumber: parsed.serialNumber,
    policyOid: parsed.policyOid,
  };
}
