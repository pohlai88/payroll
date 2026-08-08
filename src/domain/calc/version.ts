/**
 * The version of the calculation engine.
 *
 * Stamped onto every pay run alongside the rule pack's content hash, because
 * reproducing a historical payroll needs both: the rules that were in force and
 * the code that applied them. A change to any calculator, to the rounding
 * primitives, or to how items resolve is a change here.
 *
 * Bump this in the same commit as the behaviour it describes.
 */
export const CALC_ENGINE_VERSION = "1.0.0";
