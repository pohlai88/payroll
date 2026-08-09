/**
 * Where the Time Stamp Authority comes from.
 *
 * Absent means off. A test suite or a developer's machine must never reach a
 * third party's server by default, and a deployment opts in by setting the
 * variable — including to an MCMC-recognised service, which is a URL change
 * and nothing else.
 */

import { describe, expect, it } from "vitest";
import { configuredTsaUrl } from "@/service/manifest-timestamp";

describe("configuredTsaUrl", () => {
  it("is off when TSA_URL is absent", () => {
    expect(configuredTsaUrl({})).toBeNull();
  });

  it("is off when TSA_URL is blank", () => {
    expect(configuredTsaUrl({ TSA_URL: "   " })).toBeNull();
  });

  it("returns the configured authority, trimmed", () => {
    expect(
      configuredTsaUrl({ TSA_URL: " http://timestamp.digicert.com " })
    ).toBe("http://timestamp.digicert.com");
  });
});
