/**
 * monthly-fx — tiny, typed, zero-dependency FX rates with monthly-average helpers.
 *
 * Backed by the free, no-key {@link https://frankfurter.dev | Frankfurter} API
 * (European Central Bank reference rates). Frankfurter gives you latest and
 * historical daily rates; `monthly-fx` adds the piece you actually need for
 * reporting, invoicing and accounting: **monthly averages** — plus a clean,
 * fully-typed client.
 *
 * @packageDocumentation
 */

/** A `latest` / historical rates response. */
export interface RatesResponse {
  amount: number;
  base: string;
  /** ISO date the rates are for (may be the previous business day). */
  date: string;
  rates: Record<string, number>;
}

/** A time-series response keyed by ISO date. */
export interface TimeSeriesResponse {
  amount: number;
  base: string;
  start_date: string;
  end_date: string;
  rates: Record<string, Record<string, number>>;
}

/** Minimal `fetch` shape so the client works on any runtime (or with a mock). */
export type FetchLike = (input: string) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<unknown>;
}>;

export interface MonthlyFxOptions {
  /** Override the API base URL (defaults to `https://api.frankfurter.dev/v1`). */
  baseUrl?: string;
  /** Provide a `fetch` implementation (needed on runtimes without a global `fetch`). */
  fetch?: FetchLike;
}

const DEFAULT_BASE_URL = "https://api.frankfurter.dev/v1";
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const up = (c: string) => c.trim().toUpperCase();

/** Thrown when the upstream API returns a non-2xx response. */
export class FxError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(message);
    this.name = "FxError";
  }
}

/**
 * A tiny FX client. Every method is also available as a standalone function
 * (bound to a default instance) — e.g. `import { getMonthlyAverage } from "monthly-fx"`.
 */
export class MonthlyFx {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: MonthlyFxOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    const f = options.fetch ?? (globalThis as { fetch?: FetchLike }).fetch;
    if (!f) {
      throw new Error(
        "monthly-fx: no global `fetch` found — pass `options.fetch` (e.g. on Node <18).",
      );
    }
    this.fetchImpl = f;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`);
    if (!res.ok) {
      throw new FxError(
        `monthly-fx: request failed (${res.status} ${res.statusText})`,
        res.status,
        path,
      );
    }
    return (await res.json()) as T;
  }

  private symbolsQuery(base: string, symbols?: string[]): string {
    const q = new URLSearchParams({ base: up(base) });
    if (symbols?.length) q.set("symbols", symbols.map(up).join(","));
    return `?${q.toString()}`;
  }

  /** Latest available rates for `base`. */
  getLatest(base = "EUR", symbols?: string[]): Promise<RatesResponse> {
    return this.get<RatesResponse>(`/latest${this.symbolsQuery(base, symbols)}`);
  }

  /** Rates for a specific `date` (`YYYY-MM-DD`). Frankfurter returns the nearest prior business day if needed. */
  getHistorical(date: string, base = "EUR", symbols?: string[]): Promise<RatesResponse> {
    return this.get<RatesResponse>(`/${date}${this.symbolsQuery(base, symbols)}`);
  }

  /** Single `from → to` rate, latest or on a given `date`. */
  async getRate(from: string, to: string, date?: string): Promise<number> {
    const r = date
      ? await this.getHistorical(date, from, [to])
      : await this.getLatest(from, [to]);
    const rate = r.rates[up(to)];
    if (rate == null) throw new Error(`monthly-fx: no rate for ${up(to)} in response`);
    return rate;
  }

  /** Convert `amount` from → to, latest or on a given `date`. */
  async convert(amount: number, from: string, to: string, date?: string): Promise<number> {
    return amount * (await this.getRate(from, to, date));
  }

  /** Daily time series `from`..`to` (inclusive), business days only. */
  getTimeSeries(
    start: string,
    end: string,
    base = "EUR",
    symbols?: string[],
  ): Promise<TimeSeriesResponse> {
    return this.get<TimeSeriesResponse>(`/${start}..${end}${this.symbolsQuery(base, symbols)}`);
  }

  /**
   * Average `from → to` rate across a calendar month (`YYYY-MM`), over the
   * month's business days. This is the headline helper: banks and accounting
   * standards typically use a period-average rate, which the raw API doesn't give you.
   */
  async getMonthlyAverage(from: string, to: string, month: string): Promise<number> {
    if (!MONTH_RE.test(month)) throw new Error(`monthly-fx: month must be "YYYY-MM", got "${month}"`);
    const [y, m] = month.split("-").map(Number);
    const start = `${month}-01`;
    const end = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
    const ts = await this.getTimeSeries(start, end, from, [to]);
    const q = up(to);
    const vals = Object.values(ts.rates)
      .map((day) => day[q])
      .filter((v): v is number => typeof v === "number");
    if (!vals.length) throw new Error(`monthly-fx: no data for ${from}/${to} in ${month}`);
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  /** Monthly averages for every month in `[startMonth, endMonth]` (inclusive), as `{ "YYYY-MM": rate }`. */
  async getMonthlyAverages(
    from: string,
    to: string,
    startMonth: string,
    endMonth: string,
  ): Promise<Record<string, number>> {
    for (const mth of [startMonth, endMonth]) {
      if (!MONTH_RE.test(mth)) throw new Error(`monthly-fx: month must be "YYYY-MM", got "${mth}"`);
    }
    const out: Record<string, number> = {};
    let [y, m] = startMonth.split("-").map(Number);
    const [ey, em] = endMonth.split("-").map(Number);
    while (y < ey || (y === ey && m <= em)) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      out[key] = await this.getMonthlyAverage(from, to, key);
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    return out;
  }

  /** Map of supported currency code → name. */
  getCurrencies(): Promise<Record<string, string>> {
    return this.get<Record<string, string>>(`/currencies`);
  }
}

/** Default shared client (uses the global `fetch`). */
export const fx = new MonthlyFx();

export const getLatest: MonthlyFx["getLatest"] = (...a) => fx.getLatest(...a);
export const getHistorical: MonthlyFx["getHistorical"] = (...a) => fx.getHistorical(...a);
export const getRate: MonthlyFx["getRate"] = (...a) => fx.getRate(...a);
export const convert: MonthlyFx["convert"] = (...a) => fx.convert(...a);
export const getTimeSeries: MonthlyFx["getTimeSeries"] = (...a) => fx.getTimeSeries(...a);
export const getMonthlyAverage: MonthlyFx["getMonthlyAverage"] = (...a) => fx.getMonthlyAverage(...a);
export const getMonthlyAverages: MonthlyFx["getMonthlyAverages"] = (...a) => fx.getMonthlyAverages(...a);
export const getCurrencies: MonthlyFx["getCurrencies"] = (...a) => fx.getCurrencies(...a);
