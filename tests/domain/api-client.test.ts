/**
 * @feature shell
 * @layer test
 */

import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "@/web/api/client";
import { ApiClientError, SessionExpiredError } from "@/web/api/types";

describe("createApiClient", () => {
  it("sends Bearer and omits credentials", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ id: "1", email: "a@b.com", name: "A", status: "ACTIVE" })
    );
    const api = createApiClient({
      apiBase: "http://api.test",
      acquireToken: () => Promise.resolve("tok-1"),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await api.getMe();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchImpl.mock.calls[0] ?? []) as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("http://api.test/v1/me");
    expect(init.credentials).toBe("omit");
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer tok-1");
  });

  it("re-acquires token once on 401 then succeeds", async () => {
    let tokens = 0;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("no", { status: 401 }))
      .mockResolvedValueOnce(
        Response.json({
          id: "1",
          email: "a@b.com",
          name: "A",
          status: "ACTIVE",
        })
      );
    const api = createApiClient({
      apiBase: "http://api.test",
      acquireToken: () => {
        tokens += 1;
        return Promise.resolve(`tok-${tokens}`);
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const me = await api.getMe();
    expect(me.email).toBe("a@b.com");
    expect(tokens).toBe(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws SessionExpiredError after second 401", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("no", { status: 401 }));
    const api = createApiClient({
      apiBase: "http://api.test",
      acquireToken: () => Promise.resolve("tok"),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(api.getMe()).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it("downloads template as text without JSON parse", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response("Employee Code,Payroll Company Code\n", {
          status: 200,
          headers: { "Content-Type": "text/csv" },
        })
    );
    const api = createApiClient({
      apiBase: "http://api.test",
      acquireToken: () => Promise.resolve("tok"),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const csv = await api.downloadEmployeeImportTemplate(null);
    expect(csv.startsWith("Employee Code")).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps API error JSON to ApiClientError", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(
        { code: "PERMISSION_DENIED", message: "nope" },
        { status: 403 }
      )
    );
    const api = createApiClient({
      apiBase: "http://api.test",
      acquireToken: () => Promise.resolve("tok"),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    try {
      await api.getAdminUsers();
      expect.unreachable("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiClientError);
      expect((error as ApiClientError).code).toBe("PERMISSION_DENIED");
      expect((error as ApiClientError).status).toBe(403);
    }
  });

  it("getPayments requests the payments list", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ payments: [] }));
    const api = createApiClient({
      apiBase: "http://api.test",
      acquireToken: () => Promise.resolve("tok"),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await api.getPayments("run-1");
    const [url] = (fetchImpl.mock.calls[0] ?? []) as unknown as [string];
    expect(url).toBe("http://api.test/v1/pay-runs/run-1/payments");
  });

  it("holdLine POSTs the reason", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ok: true }));
    const api = createApiClient({
      apiBase: "http://api.test",
      acquireToken: () => Promise.resolve("tok"),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await api.holdLine("run-1", "line-1", "moved off-cycle");
    const [url, init] = (fetchImpl.mock.calls[0] ?? []) as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("http://api.test/v1/pay-runs/run-1/lines/line-1/hold");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      reason: "moved off-cycle",
    });
  });

  it("previewRelease POSTs lineIds", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ eligible: [], excluded: [], totalSen: 0, byBank: [] })
    );
    const api = createApiClient({
      apiBase: "http://api.test",
      acquireToken: () => Promise.resolve("tok"),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await api.previewRelease("run-1", ["line-1", "line-2"]);
    const [url, init] = (fetchImpl.mock.calls[0] ?? []) as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("http://api.test/v1/pay-runs/run-1/release/preview");
    expect(JSON.parse(init.body as string)).toEqual({
      lineIds: ["line-1", "line-2"],
    });
  });

  it("commitRelease POSTs lineIds and method", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ batchId: "run-1-B01", registerArtifactId: "art-1" })
    );
    const api = createApiClient({
      apiBase: "http://api.test",
      acquireToken: () => Promise.resolve("tok"),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await api.commitRelease("run-1", ["line-1"], "BANK");
    expect(result.batchId).toBe("run-1-B01");
    const [, init] = (fetchImpl.mock.calls[0] ?? []) as unknown as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(init.body as string)).toEqual({
      lineIds: ["line-1"],
      method: "BANK",
    });
  });

  it("closeRun POSTs with no body", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ manifestArtifactId: "art-manifest" })
    );
    const api = createApiClient({
      apiBase: "http://api.test",
      acquireToken: () => Promise.resolve("tok"),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await api.closeRun("run-1");
    expect(result.manifestArtifactId).toBe("art-manifest");
    const [url, init] = (fetchImpl.mock.calls[0] ?? []) as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("http://api.test/v1/pay-runs/run-1/close");
    expect(init.method).toBe("POST");
  });
});
