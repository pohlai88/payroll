/**
 * @feature pay-run
 * @layer domain
 *
 * Pure statutory calc (no I/O).
 */

import { quantityAmountSen } from "../money";
import {
  isQuantityItem,
  type LineItemInput,
  type PayItemDef,
  type ResolvedLineItem,
} from "./types";

/**
 * Turns entered line items into amounts.
 *
 * The engine owns this arithmetic rather than trusting an amount computed by the
 * caller, so a quantity, a rate and the figure they produce can never disagree.
 * The derivation graph then explains the multiplication it actually performed.
 */
export function resolveItems(
  items: readonly LineItemInput[],
  matrix: ReadonlyMap<string, PayItemDef>
): ResolvedLineItem[] {
  return items.map((item) => resolveItem(item, matrix));
}

export function resolveItem(
  item: LineItemInput,
  matrix: ReadonlyMap<string, PayItemDef>
): ResolvedLineItem {
  const def = matrix.get(item.payItemCode);
  /**
   * An unknown code cannot be classified as an earning or a deduction, and it
   * carries no wage-inclusion flags — so it would silently miss all three
   * statutory bases while still changing gross pay. That is a wrong payslip, not
   * a recoverable input.
   */
  if (def === undefined) {
    throw new RangeError(
      `resolveItems: no pay item is defined for code ${item.payItemCode}`
    );
  }
  /**
   * The basis is recorded on the entry as well as on the definition, because an
   * entry outlives a settings change: an item switched from per-day to fixed
   * next month must not retroactively reinterpret this month's stored quantity.
   * They must agree at entry time, and disagreeing means the caller built the
   * entry against a different pay item definition than the one in force.
   */
  if (item.basis !== def.rateBasis) {
    throw new RangeError(
      `resolveItems: ${item.payItemCode} was entered as ${item.basis} but is defined as ${def.rateBasis}`
    );
  }

  // Discriminating on `item` rather than calling `isQuantityBasis(item.basis)`:
  // a guard over the field narrows the field, not the union that owns it.
  if (isQuantityItem(item)) {
    return {
      payItemCode: item.payItemCode,
      basis: item.basis,
      qty: item.qty,
      rateSen: item.rateSen,
      amountSen: quantityAmountSen(item.qty, item.rateSen),
      computed: false,
    };
  }

  return {
    payItemCode: item.payItemCode,
    basis: item.basis,
    qty: null,
    rateSen: null,
    amountSen: item.amountSen,
    computed: false,
  };
}
