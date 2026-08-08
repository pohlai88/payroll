import { mulDivSen, quantityAmountSen } from "../money";
import type { PayBasis, TraceStep } from "./types";

export interface RegularPayResult {
  amountSen: number;
  trace: TraceStep;
}

/**
 * Regular pay by basis:
 *  MONTHLY: basic × paidDays / workingDays (EA 1955 s.18A proration; full month
 *           when paidDays === workingDays), rounded half-up to sen.
 *  DAILY:   dailyRate × paidDays.
 *  HOURLY:  hourlyRate × hoursWorked.
 */
export function regularPay(
  basis: PayBasis,
  baseRateSen: number,
  workingDays: number,
  paidDays: number | null,
  hoursWorked: number | null
): RegularPayResult {
  if (basis === "MONTHLY") {
    const pd = paidDays ?? workingDays;
    const amount = mulDivSen(baseRateSen, pd, workingDays);
    return {
      amountSen: amount,
      trace: {
        label: "Regular pay (Monthly)",
        detail:
          pd === workingDays
            ? `Full month: ${workingDays}/${workingDays} days`
            : `Prorated (EA s.18A): basic × ${pd} / ${workingDays} days`,
        amountSen: amount,
      },
    };
  }
  if (basis === "DAILY") {
    const pd = paidDays ?? 0;
    const amount = quantityAmountSen(pd, baseRateSen);
    return {
      amountSen: amount,
      trace: {
        label: "Regular pay (Daily)",
        detail: `Daily rate × ${pd} paid days`,
        amountSen: amount,
      },
    };
  }
  const hrs = hoursWorked ?? 0;
  const amount = quantityAmountSen(hrs, baseRateSen);
  return {
    amountSen: amount,
    trace: {
      label: "Regular pay (Hourly)",
      detail: `Hourly rate × ${hrs} hours`,
      amountSen: amount,
    },
  };
}
