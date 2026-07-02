import { describe, it, expect } from "vitest";
import { MonthlyFx, FxError, type FetchLike } from "../src/index.js";

/** Build a fake fetch that returns canned JSON per URL substring, tracking calls. */
function mockFetch(routes: Record<string, unknown>, calls: string[] = []): FetchLike {
  return async (input: string) => {
    calls.push(input);
    const key = Object.keys(routes).find((k) => input.includes(k));
    if (!key) return { ok: false, status: 404, statusText: "Not Found", json: async () => ({}) };
    return { ok: true, status: 200, statusText: "OK", json: async () => routes[key] };
  };
}

describe("MonthlyFx", () => {
  it("getRate returns the requested pair", async () => {
    const fx = new MonthlyFx({
      fetch: mockFetch({ "/latest": { amount: 1, base: "EUR", date: "2024-05-31", rates: { USD: 1.1 } } }),
    });
    expect(await fx.getRate("eur", "usd")).toBe(1.1);
  });

  it("convert multiplies by the rate", async () => {
    const fx = new MonthlyFx({
      fetch: mockFetch({ "/latest": { amount: 1, base: "EUR", date: "2024-05-31", rates: { USD: 1.1 } } }),
    });
    expect(await fx.convert(10, "EUR", "USD")).toBeCloseTo(11, 10);
  });

  it("getMonthlyAverage averages the month's business days and requests the right range", async () => {
    const calls: string[] = [];
    const fx = new MonthlyFx({
      fetch: mockFetch(
        {
          "2024-02-01..2024-02-29": {
            amount: 1,
            base: "EUR",
            start_date: "2024-02-01",
            end_date: "2024-02-29",
            rates: { "2024-02-01": { USD: 1.0 }, "2024-02-02": { USD: 1.1 }, "2024-02-05": { USD: 1.2 } },
          },
        },
        calls,
      ),
    });
    const avg = await fx.getMonthlyAverage("EUR", "USD", "2024-02");
    expect(avg).toBeCloseTo(1.1, 10); // (1.0 + 1.1 + 1.2) / 3
    expect(calls[0]).toContain("2024-02-01..2024-02-29"); // leap-year last day resolved correctly
  });

  it("getMonthlyAverages walks the inclusive month range", async () => {
    const fx = new MonthlyFx({
      fetch: mockFetch({
        "2024-01-01..2024-01-31": { rates: { "2024-01-02": { USD: 1.05 } } },
        "2024-02-01..2024-02-29": { rates: { "2024-02-02": { USD: 1.15 } } },
      }),
    });
    const out = await fx.getMonthlyAverages("EUR", "USD", "2024-01", "2024-02");
    expect(Object.keys(out)).toEqual(["2024-01", "2024-02"]);
    expect(out["2024-02"]).toBeCloseTo(1.15, 10);
  });

  it("rejects a malformed month", async () => {
    const fx = new MonthlyFx({ fetch: mockFetch({}) });
    await expect(fx.getMonthlyAverage("EUR", "USD", "2024/02")).rejects.toThrow(/YYYY-MM/);
  });

  it("throws FxError on a non-2xx response", async () => {
    const fx = new MonthlyFx({ fetch: mockFetch({}) }); // every route 404s
    await expect(fx.getLatest("EUR")).rejects.toBeInstanceOf(FxError);
  });
});
