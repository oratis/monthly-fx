<p align="center">
  <a href="https://www.npmjs.com/package/monthly-fx"><img src="https://raw.githubusercontent.com/oratis/monthly-fx/main/assets/banner.png" alt="monthly-fx" width="860"></a>
</p>

<p align="center">

[![npm version](https://img.shields.io/npm/v/monthly-fx.svg)](https://www.npmjs.com/package/monthly-fx)
[![CI](https://github.com/oratis/monthly-fx/actions/workflows/ci.yml/badge.svg)](https://github.com/oratis/monthly-fx/actions/workflows/ci.yml)
[![npm bundle size](https://img.shields.io/bundlephobia/minzip/monthly-fx)](https://bundlephobia.com/package/monthly-fx)
[![license](https://img.shields.io/npm/l/monthly-fx.svg)](./LICENSE)

</p>

**Tiny, typed, zero-dependency foreign-exchange rates — with the monthly-average helper you actually need.**

Backed by the free, no-key [Frankfurter](https://frankfurter.dev) API (European Central Bank reference rates). Frankfurter gives you *latest* and *historical daily* rates; `monthly-fx` adds the piece reporting, invoicing and accounting really need: **monthly averages** — behind a clean, fully-typed API that runs anywhere `fetch` does (Node 18+, Bun, Deno, browsers, edge).

```bash
npm i monthly-fx
```

## Quick start

```ts
import { getRate, convert, getMonthlyAverage } from "monthly-fx";

// Latest spot rate
await getRate("EUR", "USD");                 // → 1.14

// Convert an amount
await convert(100, "EUR", "USD");            // → 113.83

// 👇 the reason this package exists: a period-average rate for a whole month
await getMonthlyAverage("EUR", "USD", "2024-03");   // → 1.0872  (avg of March's business days)
```

Need several months at once (e.g. to build a report)?

```ts
import { getMonthlyAverages } from "monthly-fx";

await getMonthlyAverages("EUR", "USD", "2024-01", "2024-04");
// → { "2024-01": 1.0911, "2024-02": 1.0795, "2024-03": 1.0872, "2024-04": 1.0732 }
```

## Why?

Spot rates are the wrong tool for anything that spans a period. Accounting standards
(and most finance teams) translate a month of activity at that month's **average**
rate — not the rate on some arbitrary day. Computing that yourself means paging the
daily series, filtering non-business days and averaging. `monthly-fx` does it in one call,
with types, zero dependencies and a free data source that needs no API key.

## API

Every method exists both on a `MonthlyFx` instance and as a standalone import.

| Function | Description |
| --- | --- |
| `getLatest(base?, symbols?)` | Latest rates for `base`. |
| `getHistorical(date, base?, symbols?)` | Rates on `YYYY-MM-DD` (nearest prior business day if needed). |
| `getRate(from, to, date?)` | A single `from → to` rate, latest or historical. |
| `convert(amount, from, to, date?)` | Convert an amount. |
| `getTimeSeries(start, end, base?, symbols?)` | Daily series over a date range. |
| **`getMonthlyAverage(from, to, "YYYY-MM")`** | **Average rate across a calendar month.** |
| `getMonthlyAverages(from, to, startMonth, endMonth)` | Averages for each month in an inclusive range. |
| `getCurrencies()` | Supported currency code → name. |

### Custom instance

```ts
import { MonthlyFx } from "monthly-fx";

const fx = new MonthlyFx({
  baseUrl: "https://api.frankfurter.dev/v1", // override if self-hosting Frankfurter
  fetch: myFetch,                            // inject fetch (Node <18, tests, proxies)
});
```

Errors from the upstream API throw a typed `FxError` (`.status`, `.path`).

## Notes

- **Data source & attribution:** rates come from the ECB via [Frankfurter](https://frankfurter.dev); published on business days only. This package is an independent client and is not affiliated with the ECB or Frankfurter.
- **Not for high-frequency / trading use.** ECB reference rates are daily, indicative, and not a market feed.

## License

[MIT](./LICENSE) © [oratis](https://github.com/oratis)
