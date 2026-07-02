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
      fetch: mockFetch({ "/latest": { amount: 1, base: "USD", date: "2024-05-31", rates: { CNY: 7.2 } } }),
    });
    expect(await fx.getRate("usd", "cny")).toBe(7.2);
  });

  it("convert multiplies by the rate", async () => {
    const fx = new MonthlyFx({
      fetch: mockFetch({ "/latest": { amount: 1, base: "USD", date: "2024-05-31", rates: { CNY: 7 } } }),
    });
    expect(await fx.convert(10, "USD", "CNY")).toBe(70);
  });

  it("getMonthlyAverage averages the month's business days and requests the right range", async () => {
    const calls: string[] = [];
    const fx = new MonthlyFx({
      fetch: mockFetch(
        {
          "2024-02-01..2024-02-29": {
            amount: 1,
            base: "USD",
            start_date: "2024-02-01",
            end_date: "2024-02-29",
            rates: { "2024-02-01": { CNY: 7.0 }, "2024-02-02": { CNY: 7.2 }, "2024-02-05": { CNY: 7.4 } },
          },
        },
        calls,
      ),
    });
    const avg = await fx.getMonthlyAverage("USD", "CNY", "2024-02");
    expect(avg).toBeCloseTo(7.2, 10); // (7.0 + 7.2 + 7.4) / 3
    expect(calls[0]).toContain("2024-02-01..2024-02-29"); // leap-year last day resolved correctly
  });

  it("getMonthlyAverages walks the inclusive month range", async () => {
    const fx = new MonthlyFx({
      fetch: mockFetch({
        "2024-01-01..2024-01-31": { rates: { "2024-01-02": { CNY: 7.1 } } },
        "2024-02-01..2024-02-29": { rates: { "2024-02-02": { CNY: 7.3 } } },
      }),
    });
    const out = await fx.getMonthlyAverages("USD", "CNY", "2024-01", "2024-02");
    expect(Object.keys(out)).toEqual(["2024-01", "2024-02"]);
    expect(out["2024-02"]).toBeCloseTo(7.3, 10);
  });

  it("rejects a malformed month", async () => {
    const fx = new MonthlyFx({ fetch: mockFetch({}) });
    await expect(fx.getMonthlyAverage("USD", "CNY", "2024/02")).rejects.toThrow(/YYYY-MM/);
  });

  it("throws FxError on a non-2xx response", async () => {
    const fx = new MonthlyFx({ fetch: mockFetch({}) }); // every route 404s
    await expect(fx.getLatest("USD")).rejects.toBeInstanceOf(FxError);
  });
});
