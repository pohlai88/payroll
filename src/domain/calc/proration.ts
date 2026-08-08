import { mulDivSen, roundHalfUpSen } from "../money";
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
    const amount = roundHalfUpSen(baseRateSen * pd);
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
  const amount = roundHalfUpSen(baseRateSen * hrs);
  return {
    amountSen: amount,
    trace: {
      label: "Regular pay (Hourly)",
      detail: `Hourly rate × ${hrs} hours`,
      amountSen: amount,
    },
  };
}

/** Meal allowance = mealDays × ratePerDay. */
export function mealAllowance(mealDays: number | null, ratePerDaySen: number): number {
  if (!mealDays || ratePerDaySen <= 0) return 0;
  return roundHalfUpSen(mealDays * ratePerDaySen);
}

/** Overtime = otHours × otRate (rate is a manual policy input). */
export function overtimePay(otHours: number, otRateSen: number): number {
  if (!otHours || otRateSen <= 0) return 0;
  return roundHalfUpSen(otHours * otRateSen);
}
