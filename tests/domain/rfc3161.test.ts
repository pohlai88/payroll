/**
 * @feature control
 * @layer test
 *
 * RFC 3161 request encoding — known-answer vectors.
 *
 * The expected bytes are written out literally rather than round-tripped
 * through our own parser: a DER encoder tested only against its matching
 * decoder agrees with itself while both are wrong, and the thing that has to
 * be right is what a Time Stamp Authority receives on the wire.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildTimeStampRequest,
  parseTimeStampResponse,
} from "@/domain/timestamp/rfc3161";

/** SHA-256 of "clarity-payroll timestamp fixture v1" — the stamped input. */
const FIXTURE_HASH =
  "906bded9cf3a4777f15b1814177b3aa874633d8d01219e19c789b8fa1497f9b8";

/** A genuine DigiCert reply, captured once and replayed offline. */
const FIXTURE_RESPONSE = new Uint8Array(
  readFileSync(
    path.resolve(import.meta.dirname, "../fixtures/digicert-timestamp.tsr")
  )
);

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

/**
 * TimeStampReq ::= SEQUENCE {                       30 <len>
 *   version           INTEGER { v1(1) },            02 01 01
 *   messageImprint    MessageImprint,               30 31
 *     hashAlgorithm   AlgorithmIdentifier,          30 0d 06 09 <sha256 oid> 05 00
 *     hashedMessage   OCTET STRING (32)             04 20 <hash>
 *   nonce             INTEGER OPTIONAL,             02 <len> <nonce>
 *   certReq           BOOLEAN                       01 01 ff
 * }
 */
const VERSION_V1 = "020101";
const IMPRINT = `3031300d060960864801650304020105000420${FIXTURE_HASH}`;
const CERT_REQ_TRUE = "0101ff";

describe("buildTimeStampRequest", () => {
  it("encodes a SHA-256 imprint with certReq as DigiCert expects", () => {
    const request = buildTimeStampRequest({ hashHex: FIXTURE_HASH });

    expect(hex(request)).toBe(`3039${VERSION_V1}${IMPRINT}${CERT_REQ_TRUE}`);
  });

  it("omits certReq when the caller does not want the TSA certificate", () => {
    const request = buildTimeStampRequest({
      hashHex: FIXTURE_HASH,
      certReq: false,
    });

    expect(hex(request)).toBe(`3036${VERSION_V1}${IMPRINT}`);
  });

  it("encodes a nonce as a positive INTEGER before certReq", () => {
    const request = buildTimeStampRequest({
      hashHex: FIXTURE_HASH,
      nonce: new Uint8Array([0x01, 0x02, 0x03, 0x04]),
    });

    expect(hex(request)).toBe(
      `303f${VERSION_V1}${IMPRINT}020401020304${CERT_REQ_TRUE}`
    );
  });

  /** DER INTEGER is signed: a leading high bit would read as negative. */
  it("pads a high-bit nonce so it stays positive", () => {
    const request = buildTimeStampRequest({
      hashHex: FIXTURE_HASH,
      nonce: new Uint8Array([0xff, 0x02]),
    });

    expect(hex(request)).toContain("020300ff02");
  });

  it("rejects a hash that is not 32 bytes of hex", () => {
    expect(() => buildTimeStampRequest({ hashHex: "abcd" })).toThrow(
      /sha-256/i
    );
    expect(() =>
      buildTimeStampRequest({ hashHex: `zz${FIXTURE_HASH.slice(2)}` })
    ).toThrow(/sha-256/i);
  });
});

describe("parseTimeStampResponse", () => {
  it("reads the imprint, serial and genTime out of a real DigiCert token", () => {
    const parsed = parseTimeStampResponse(FIXTURE_RESPONSE);

    expect(parsed.status).toBe("GRANTED");
    expect(parsed.messageImprintHex).toBe(FIXTURE_HASH);
    expect(parsed.serialNumber).toMatch(/^[0-9a-f]+$/);
    expect(parsed.policyOid).toMatch(/^\d+(\.\d+)+$/);
    expect(parsed.genTime.getTime()).toBeGreaterThan(
      Date.parse("2026-08-01T00:00:00Z")
    );
    expect(parsed.genTime.getTime()).toBeLessThan(Date.now() + 60_000);
  });

  it("returns the token alone, so it can be stored and verified later", () => {
    const parsed = parseTimeStampResponse(FIXTURE_RESPONSE);

    // ContentInfo SEQUENCE wrapping OID 1.2.840.113549.1.7.2 (signedData).
    expect(parsed.token[0]).toBe(0x30);
    expect(hex(parsed.token)).toContain("2a864886f70d010702");
    expect(parsed.token.length).toBeLessThan(FIXTURE_RESPONSE.length);
  });

  it("reports no nonce when the request carried none", () => {
    expect(parseTimeStampResponse(FIXTURE_RESPONSE).nonceHex).toBeNull();
  });

  /** TimeStampResp ::= SEQUENCE { PKIStatusInfo ::= SEQUENCE { INTEGER 2 } } */
  it("throws when the authority rejected the request", () => {
    const rejection = Uint8Array.of(0x30, 0x05, 0x30, 0x03, 0x02, 0x01, 0x02);

    expect(() => parseTimeStampResponse(rejection)).toThrow(/rejection/i);
  });

  it("throws on bytes that are not a timestamp response", () => {
    expect(() => parseTimeStampResponse(Uint8Array.of(0x01, 0x02))).toThrow(
      /timestamp response/i
    );
  });
});
