/**
 * ISO date primitives shared by the calc layer.
 *
 * `isIsoDate` is for the validation wall (`validate.ts`), which reports
 * structured issues a form can display. `parseIsoDate` is the tripwire behind
 * it: it throws, because a malformed date reaching age-banded rate selection is
 * a data-integrity failure rather than a user-input condition. Same split as
 * `validateLineInputs` / the `RangeError`s in `money.ts`.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True when (y, m, d) is a real calendar date — rejects 31 Feb and friends. */
export function isRealDate(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/** True when `value` is a well-formed ISO yyyy-mm-dd naming a real date. */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) {
    return false;
  }
  return isRealDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

/**
 * Parse an ISO yyyy-mm-dd string into its parts, throwing on anything else.
 *
 * `what` names the caller/field so the message points at the offending input.
 */
export function parseIsoDate(
  value: string,
  what: string
): { y: number; m: number; d: number } {
  const match = ISO_DATE.exec(value);
  if (!match) {
    throw new RangeError(
      `${what}: expected ISO yyyy-mm-dd, got ${JSON.stringify(value)}`
    );
  }
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!isRealDate(y, m, d)) {
    throw new RangeError(
      `${what}: not a real calendar date, got ${JSON.stringify(value)}`
    );
  }
  return { y, m, d };
}
