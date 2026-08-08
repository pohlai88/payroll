/**
 * S02 Monetary Correctness Tests
 *
 * These tests prove the S02 requirements for exact sen arithmetic,
 * proper rounding, and effective dating.
 */

import { describe, expect, it } from "vitest";
import {
  formatRM,
  mulDivSen,
  pctHalfUpSen,
  pctRoundUpToRinggitSen,
  quantityAmountSen,
  roundHalfUpSen,
} from "@/domain/money";

describe("S02 Monetary Foundation: Exact Sen Arithmetic", () => {
  it("prevents floating-point drift from entering payroll calculations", () => {
    // These specific values are known to produce floating-point error
    // when multiplied directly in JavaScript
    const problematicValues = [
      { qty: 1.15, rate: 100, expected: 115 }, // 1.15 * 100 = 114.99999999999999 in float
      { qty: 70.07, rate: 100, expected: 7007 }, // 70.07 * 100 = 7006.999999999999 in float
      { qty: 0.1 + 0.2, rate: 100, expected: 30 }, // Classic float precision issue
    ];

    for (const { qty, rate, expected } of problematicValues) {
      // Direct float multiplication demonstrates the problem
      const directFloat = qty * rate;

      // Show that direct multiplication can be imprecise
      if (!Number.isSafeInteger(directFloat)) {
        expect(directFloat).not.toBe(expected);
      }

      // Our money function produces correct integer sen
      const correctSen = quantityAmountSen(qty, rate);
      expect(Number.isSafeInteger(correctSen)).toBe(true);
      expect(correctSen).toBe(expected);
    }
  });

  it("rejects NaN, Infinity, and unsafe integers at the boundary", () => {
    const invalidInputs = [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
      Number.MIN_SAFE_INTEGER - 1,
      1.5, // fractional sen
    ];

    for (const invalid of invalidInputs) {
      expect(() => formatRM(invalid)).toThrow(RangeError);
      expect(() => quantityAmountSen(10, invalid)).toThrow(RangeError);
      expect(() => pctHalfUpSen(invalid, 1)).toThrow(RangeError);
      expect(() => pctRoundUpToRinggitSen(invalid, 1)).toThrow(RangeError);
      expect(() => mulDivSen(invalid, 1, 2)).toThrow(RangeError);
    }
  });

  it("ensures exact reconciliation to the sen across all components", () => {
    // Simulate a payroll calculation with multiple components
    const basicSalary = 350000; // RM3,500.00
    const allowance = 75000; // RM750.00
    const overtimeHours = 8.5;
    const overtimeRate = 2500; // RM25.00/hour

    // Calculate components using money functions
    const overtimePay = quantityAmountSen(overtimeHours, overtimeRate);
    const gross = basicSalary + allowance + overtimePay;

    // Calculate statutory deductions
    const epfEe = pctHalfUpSen(gross, 11); // 11% employee EPF
    const socsoEe = 450; // Fixed amount for this gross range
    const eisEe = pctHalfUpSen(gross, 0.2); // 0.2% employee EIS

    // Calculate other deductions
    const totalStatutory = epfEe + socsoEe + eisEe;
    const otherDeductions = 5000; // RM50 meal deduction
    const totalDeductions = totalStatutory + otherDeductions;

    // Calculate net pay
    const net = gross - totalDeductions;

    // Verify every component is an exact integer sen
    expect(Number.isSafeInteger(overtimePay)).toBe(true);
    expect(Number.isSafeInteger(gross)).toBe(true);
    expect(Number.isSafeInteger(epfEe)).toBe(true);
    expect(Number.isSafeInteger(eisEe)).toBe(true);
    expect(Number.isSafeInteger(totalStatutory)).toBe(true);
    expect(Number.isSafeInteger(totalDeductions)).toBe(true);
    expect(Number.isSafeInteger(net)).toBe(true);

    // Verify exact reconciliation: gross = net + deductions
    expect(gross).toBe(net + totalDeductions);

    // No hidden fractional remainder
    const reconciliation = gross - net - totalDeductions;
    expect(reconciliation).toBe(0);
  });
});

describe("S02 Rounding Contracts: Explicit Methods and Stages", () => {
  it("documents and enforces specific rounding for each calculation type", () => {
    const amount = 25050; // RM250.50

    // Half-up rounding for regular calculations
    expect(roundHalfUpSen(2.5)).toBe(3);
    expect(roundHalfUpSen(-2.5)).toBe(-3);

    // Percentage with half-up rounding (HRDF, general percentages)
    expect(pctHalfUpSen(amount, 0.5)).toBe(125); // RM250.50 × 0.5% = RM1.25 (125 sen)

    // Percentage rounded UP to ringgit (KWSP above-ceiling)
    expect(pctRoundUpToRinggitSen(amount, 11)).toBe(2800); // RM250.50 × 11% = RM27.555 → RM28.00

    // Proration with exact integer arithmetic
    expect(mulDivSen(amount, 15, 22)).toBe(17080); // 15/22 of RM250.50, half-up
  });

  it("proves rounding occurs at the defined stage, not before", () => {
    // Intermediate calculations stay precise until final rounding
    const monthlyPay = 300000; // RM3,000
    const workingDays = 22;
    const actualDays = 15.5; // Half-day attendance

    // Using mulDivSen keeps precision until the final step
    const proratedPay = mulDivSen(monthlyPay, actualDays, workingDays);

    // The result should be rounded only once, at the end
    const expected = Math.round((monthlyPay * actualDays) / workingDays);
    expect(proratedPay).toBe(expected);
    expect(Number.isSafeInteger(proratedPay)).toBe(true);
  });
});

describe("S02 One-Sen Boundaries", () => {
  it("handles exact boundaries correctly without introducing errors", () => {
    // Test calculations that land exactly on sen boundaries
    const exactCases = [
      { base: 100000, pct: 1, expected: 1000 }, // Exactly RM10 × 1% = RM10
      { base: 200000, pct: 0.5, expected: 1000 }, // Exactly RM2000 × 0.5% = RM10
      { base: 500000, pct: 2, expected: 10000 }, // Exactly RM5000 × 2% = RM100
    ];

    for (const { base, pct, expected } of exactCases) {
      const result = pctHalfUpSen(base, pct);
      expect(result).toBe(expected);

      // Verify no rounding artifacts
      const mathematicalResult = (base * pct) / 100;
      expect(mathematicalResult).toBe(expected); // Should be exact
    }
  });

  it("rounds half-sen amounts consistently away from zero", () => {
    const halfSenCases = [
      { amount: 100.5, expected: 101 },
      { amount: 200.5, expected: 201 },
      { amount: -100.5, expected: -101 },
      { amount: -200.5, expected: -201 },
    ];

    for (const { amount, expected } of halfSenCases) {
      expect(roundHalfUpSen(amount)).toBe(expected);
    }
  });

  it("handles KWSP ceiling boundaries precisely", () => {
    // Test the exact boundary where KWSP switches to percentage
    const atCeiling = 600000; // RM6,000 (current ceiling)
    const aboveCeiling = 600100; // RM6,001

    // At ceiling: should be exact contribution
    const atCeilingResult = pctRoundUpToRinggitSen(atCeiling, 11);
    expect(atCeilingResult).toBe(66000); // Exactly RM660

    // Above ceiling: should round UP to next ringgit
    const aboveCeilingResult = pctRoundUpToRinggitSen(aboveCeiling, 11);
    expect(aboveCeilingResult).toBe(66100); // RM660.11 → RM661.00
  });
});

describe("S02 Negative Control Test", () => {
  it("detects when a one-sen error is introduced (negative control)", () => {
    // This test verifies that our testing approach can detect errors

    // Test with a value that definitely shows floating-point problems
    const problematicValue = 0.1 + 0.2; // Classic float precision issue = 0.30000000000000004
    expect(problematicValue).not.toBe(0.3); // Proves we can detect float errors

    // Direct multiplication with problematic value
    const problematicResult = problematicValue * 100; // Would be ~30.000000000000004
    expect(Number.isSafeInteger(problematicResult)).toBe(false);

    // Our money functions would prevent this from reaching payroll
    expect(() => formatRM(problematicResult)).toThrow(RangeError);

    // Demonstrate that 1.15 * 100 produces float drift
    const driftValue = 1.15 * 100; // 114.99999999999999
    expect(driftValue).not.toBe(115);
    expect(Number.isSafeInteger(driftValue)).toBe(false);

    // But our function handles it correctly
    const correctValue = quantityAmountSen(1.15, 100);
    expect(correctValue).toBe(115);
    expect(Number.isSafeInteger(correctValue)).toBe(true);
  });

  it("fails when expected money validation is bypassed", () => {
    // This would fail if someone bypassed our money validation
    const bypassed = 8.57 * 100 + 0.0000000001; // Slightly non-integer

    // Our validation should catch this
    expect(Number.isSafeInteger(bypassed)).toBe(false);
    expect(() => formatRM(bypassed)).toThrow(RangeError);
  });
});
