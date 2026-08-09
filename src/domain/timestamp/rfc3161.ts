// biome-ignore-all lint/suspicious/noBitwiseOperators: DER is a bit-level encoding — the masks and shifts below are the specification, not a micro-optimisation.

/**
 * RFC 3161 Time-Stamp Protocol — DER encoding of a request, DER reading of a
 * reply.
 *
 * Hand-rolled rather than pulled from a library: the request is a 59-byte
 * structure, and the alternative is an ASN.1 dependency in the trust path of
 * the closure manifest. SHA-256 is the only imprint algorithm offered, because
 * it is the only hash this system records anywhere else.
 *
 * Reading a token is not verifying one. Nothing here checks the authority's
 * signature or its certificate chain; the stored `.tsr` bytes remain the
 * artifact a verifier (`openssl ts -verify`) is pointed at. What this module
 * guarantees is that the token we store is the token we asked for.
 */

const SHA256_HEX = /^[0-9a-f]{64}$/i;
const GENERALIZED_TIME =
  /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.(\d+))?Z$/;

const TAG_INTEGER = 0x02;
const TAG_OCTET_STRING = 0x04;
const TAG_BOOLEAN = 0x01;
const TAG_SEQUENCE = 0x30;
const TAG_OID = 0x06;
const TAG_GENERALIZED_TIME = 0x18;
const TAG_CONTEXT_0 = 0xa0;

const LONG_FORM_THRESHOLD = 0x80;
const BYTE_MASK = 0xff;
const BITS_PER_BYTE = 8;

/**
 * AlgorithmIdentifier for id-sha256 (2.16.840.1.101.3.4.2.1) with an explicit
 * NULL parameter. Written literally: TSAs reject the absent-parameter form.
 */
const SHA256_ALGORITHM = Uint8Array.of(
  0x30,
  0x0d,
  0x06,
  0x09,
  0x60,
  0x86,
  0x48,
  0x01,
  0x65,
  0x03,
  0x04,
  0x02,
  0x01,
  0x05,
  0x00
);

export interface TimeStampRequestOptions {
  /** Lowercase or uppercase SHA-256 digest of the data being stamped. */
  readonly hashHex: string;
  /** Random bytes echoed back in the token; proves the reply is not a replay. */
  readonly nonce?: Uint8Array;
  /** Ask the TSA to embed its signing certificate. Defaults to true. */
  readonly certReq?: boolean;
}

function encodeLength(length: number): Uint8Array {
  if (length < LONG_FORM_THRESHOLD) {
    return Uint8Array.of(length);
  }
  const bytes: number[] = [];
  for (let rest = length; rest > 0; rest >>>= BITS_PER_BYTE) {
    bytes.unshift(rest & BYTE_MASK);
  }
  return Uint8Array.from([LONG_FORM_THRESHOLD | bytes.length, ...bytes]);
}

function concat(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function tlv(tag: number, content: Uint8Array): Uint8Array<ArrayBuffer> {
  return concat([Uint8Array.of(tag), encodeLength(content.length), content]);
}

/** DER INTEGER is signed, so a leading high bit needs a zero byte in front. */
function positiveInteger(magnitude: Uint8Array): Uint8Array<ArrayBuffer> {
  const [first] = magnitude;
  if (first === undefined) {
    throw new Error("integer magnitude must not be empty");
  }
  const body =
    first >= LONG_FORM_THRESHOLD
      ? concat([Uint8Array.of(0x00), magnitude])
      : magnitude;
  return tlv(TAG_INTEGER, body);
}

/**
 * `Uint8Array<ArrayBuffer>` rather than plain `Uint8Array`: `fetch` will not
 * accept a view over a possibly-shared buffer as a body.
 */
export function buildTimeStampRequest(
  options: TimeStampRequestOptions
): Uint8Array<ArrayBuffer> {
  if (!SHA256_HEX.test(options.hashHex)) {
    throw new Error(
      `not a SHA-256 digest: ${JSON.stringify(options.hashHex)} (want 64 hex characters)`
    );
  }

  const imprint = tlv(
    TAG_SEQUENCE,
    concat([
      SHA256_ALGORITHM,
      tlv(TAG_OCTET_STRING, Buffer.from(options.hashHex, "hex")),
    ])
  );

  const parts: Uint8Array[] = [positiveInteger(Uint8Array.of(0x01)), imprint];
  if (options.nonce !== undefined) {
    parts.push(positiveInteger(options.nonce));
  }
  if (options.certReq !== false) {
    parts.push(tlv(TAG_BOOLEAN, Uint8Array.of(BYTE_MASK)));
  }

  return tlv(TAG_SEQUENCE, concat(parts));
}

/** PKIStatus values, RFC 3161 §2.4.2. Only the first two carry a token. */
const STATUS_NAMES = [
  "granted",
  "grantedWithMods",
  "rejection",
  "waiting",
  "revocationWarning",
  "revocationNotification",
] as const;

export interface ParsedTimestampToken {
  readonly status: "GRANTED" | "GRANTED_WITH_MODS";
  /** DER ContentInfo — the bytes to store as the `.tsr` artifact. */
  readonly token: Uint8Array;
  readonly genTime: Date;
  readonly serialNumber: string;
  readonly messageImprintHex: string;
  readonly policyOid: string;
  readonly nonceHex: string | null;
}

interface Tlv {
  readonly tag: number;
  readonly content: Uint8Array;
  /** Tag through content, i.e. the element as it appeared. */
  readonly raw: Uint8Array;
  readonly end: number;
}

function readTlv(bytes: Uint8Array, offset: number): Tlv {
  const tag = bytes[offset];
  const firstLengthByte = bytes[offset + 1];
  if (tag === undefined || firstLengthByte === undefined) {
    throw new Error("truncated DER element");
  }

  let length = firstLengthByte;
  let cursor = offset + 2;
  if (firstLengthByte >= LONG_FORM_THRESHOLD) {
    const count = firstLengthByte & 0x7f;
    length = 0;
    for (let i = 0; i < count; i += 1) {
      const byte = bytes[cursor + i];
      if (byte === undefined) {
        throw new Error("truncated DER length");
      }
      length = length * (BYTE_MASK + 1) + byte;
    }
    cursor += count;
  }

  const end = cursor + length;
  if (end > bytes.length) {
    throw new Error("DER element runs past the end of the buffer");
  }
  return {
    tag,
    content: bytes.subarray(cursor, end),
    raw: bytes.subarray(offset, end),
    end,
  };
}

function childrenOf(content: Uint8Array): Tlv[] {
  const out: Tlv[] = [];
  let offset = 0;
  while (offset < content.length) {
    const element = readTlv(content, offset);
    out.push(element);
    offset = element.end;
  }
  return out;
}

function expectTag(element: Tlv | undefined, tag: number, what: string): Tlv {
  if (element === undefined || element.tag !== tag) {
    throw new Error(
      `malformed timestamp token: expected ${what} (tag 0x${tag.toString(16)})`
    );
  }
  return element;
}

function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

/** DER INTEGER content as unpadded lowercase hex. */
function integerHex(element: Tlv): string {
  let start = 0;
  while (
    start < element.content.length - 1 &&
    element.content[start] === 0x00
  ) {
    start += 1;
  }
  return toHex(element.content.subarray(start));
}

function decodeOid(content: Uint8Array): string {
  const [first] = content;
  if (first === undefined) {
    throw new Error("malformed timestamp token: empty OID");
  }
  const FIRST_ARC_SPAN = 40;
  const MAX_FIRST_ARC = 2;
  const firstArc = Math.min(Math.floor(first / FIRST_ARC_SPAN), MAX_FIRST_ARC);
  const arcs: number[] = [firstArc, first - firstArc * FIRST_ARC_SPAN];

  const CONTINUES = 0x80;
  const VALUE_BITS = 7;
  let value = 0;
  for (const byte of content.subarray(1)) {
    value = value * (1 << VALUE_BITS) + (byte & (CONTINUES - 1));
    if ((byte & CONTINUES) === 0) {
      arcs.push(value);
      value = 0;
    }
  }
  return arcs.join(".");
}

function decodeGeneralizedTime(content: Uint8Array): Date {
  const text = Buffer.from(content).toString("ascii");
  const match = GENERALIZED_TIME.exec(text);
  if (match === null) {
    throw new Error(`malformed timestamp token: genTime ${text}`);
  }
  const [, year, month, day, hour, minute, second, fraction] = match;
  const MILLIS_DIGITS = 3;
  const millis = Number.parseInt(
    (fraction ?? "0").padEnd(MILLIS_DIGITS, "0").slice(0, MILLIS_DIGITS),
    10
  );
  return new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      millis
    )
  );
}

/** ContentInfo → SignedData → EncapsulatedContentInfo → the TSTInfo bytes. */
function extractTstInfo(token: Tlv): Uint8Array {
  const contentInfo = childrenOf(token.content);
  const explicit = expectTag(contentInfo[1], TAG_CONTEXT_0, "[0] content");
  const signedData = expectTag(
    childrenOf(explicit.content)[0],
    TAG_SEQUENCE,
    "SignedData"
  );
  const encap = expectTag(
    childrenOf(signedData.content)[2],
    TAG_SEQUENCE,
    "EncapsulatedContentInfo"
  );
  const eContent = expectTag(
    childrenOf(encap.content)[1],
    TAG_CONTEXT_0,
    "[0] eContent"
  );
  const octets = expectTag(
    childrenOf(eContent.content)[0],
    TAG_OCTET_STRING,
    "eContent OCTET STRING"
  );
  // The octets are themselves a DER TSTInfo SEQUENCE; return its fields.
  return expectTag(readTlv(octets.content, 0), TAG_SEQUENCE, "TSTInfo").content;
}

function readStatus(response: Tlv): "GRANTED" | "GRANTED_WITH_MODS" {
  const top = childrenOf(response.content);
  const info = expectTag(top[0], TAG_SEQUENCE, "PKIStatusInfo");
  const status = Number(
    Number.parseInt(
      integerHex(
        expectTag(childrenOf(info.content)[0], TAG_INTEGER, "PKIStatus")
      ),
      16
    )
  );
  if (status === 0) {
    return "GRANTED";
  }
  if (status === 1) {
    return "GRANTED_WITH_MODS";
  }
  const name = STATUS_NAMES[status] ?? `unknown status ${status}`;
  throw new Error(`timestamp authority returned ${name}`);
}

export function parseTimeStampResponse(der: Uint8Array): ParsedTimestampToken {
  if (der[0] !== TAG_SEQUENCE) {
    throw new Error("not a timestamp response: no outer DER SEQUENCE");
  }
  const response = readTlv(der, 0);

  const status = readStatus(response);
  const token = expectTag(
    childrenOf(response.content)[1],
    TAG_SEQUENCE,
    "timeStampToken"
  );

  const tstInfo = childrenOf(extractTstInfo(token));
  const policy = expectTag(tstInfo[1], TAG_OID, "TSTInfo policy");
  const imprint = expectTag(tstInfo[2], TAG_SEQUENCE, "TSTInfo messageImprint");
  const serial = expectTag(tstInfo[3], TAG_INTEGER, "TSTInfo serialNumber");
  const genTime = expectTag(
    tstInfo[4],
    TAG_GENERALIZED_TIME,
    "TSTInfo genTime"
  );

  // Everything after genTime is optional; the nonce is the only INTEGER there.
  const nonce = tstInfo.slice(5).find((e) => e.tag === TAG_INTEGER);

  return {
    status,
    token: token.raw,
    genTime: decodeGeneralizedTime(genTime.content),
    serialNumber: integerHex(serial),
    messageImprintHex: toHex(
      expectTag(
        childrenOf(imprint.content)[1],
        TAG_OCTET_STRING,
        "hashedMessage"
      ).content
    ),
    policyOid: decodeOid(policy.content),
    nonceHex: nonce === undefined ? null : integerHex(nonce),
  };
}
