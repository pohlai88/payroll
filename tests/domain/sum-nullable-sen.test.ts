import { describe, expect, it } from "vitest";
import { sumNullableSen } from "@/domain/sum-nullable-sen";

describe("sumNullableSen", () => {
  it("sums known values and leaves incomplete false", () => {
    expect(sumNullableSen([100, 200, 0])).toEqual({
      sum: 300,
      missing: 0,
      incomplete: false,
    });
  });

  it("omits null without coercing to zero", () => {
    expect(sumNullableSen([100, null, 50])).toEqual({
      sum: 150,
      missing: 1,
      incomplete: true,
    });
  });

  it("treats empty as complete zero", () => {
    expect(sumNullableSen([])).toEqual({
      sum: 0,
      missing: 0,
      incomplete: false,
    });
  });
});
