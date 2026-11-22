# Phoenix Signals

Personal stock-analysis dashboard for NSE/BSE that gives a **BUY / SELL / HOLD / WATCH** call per stock, refreshes live during market hours, and explains every call.

Stack: Next.js 15 (App Router) · TypeScript · deployed on Vercel · no database, no API keys needed.

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # indicator + signal unit tests
npm run typecheck
```

## Deploy (GitHub + Vercel)

1. Replace the contents of your existing repo with these files (or push to a new branch), then commit and push.
2. In Vercel, import the repo. Framework preset is detected automatically (Next.js). No environment variables are required.
3. If your preview URLs ask for a Vercel login, that is Vercel's *Deployment Protection*. Leave it on for a private tool, or change it under Project Settings, Deployment Protection.

## How the signals work

Ten transparent factors each add or subtract points. The total is normalised to -100..+100.

| Group | Factors |
|---|---|
| Trend | Price vs 50 avg, 50 vs 200 avg (or 20 vs 50 on short history), price vs 20 avg, ADX direction and strength |
| Momentum | RSI(14), MACD histogram and slope, Stochastic |
| Stretch | Bollinger %B (contrarian, small weight) |
| Confirmation | Volume vs 20-bar average on the day's move |
| Position | Distance from 52-week high/low |

Classification:

- **BUY**: score >= +30, trend factors net positive, and RSI < 80 (no chasing).
- **SELL**: score <= -30 and trend factors net negative.
- **WATCH**: not actionable yet, but there is an event (MACD cross, RSI leaving an extreme, volatility squeeze, 20-bar breakout/breakdown, golden/death cross) or the score is leaning (|score| >= 15).
- **HOLD**: neutral, no edge either way.

Each BUY/SELL/WATCH also gets an ATR-based risk plan: stop at 1.5 x ATR, targets at 1.5R and 3R.

Click any row for the factor breakdown, chart and key numbers. Tune the thresholds in `lib/signals.ts`.

## Important: "real time" and your data source

The default provider is Yahoo Finance's public chart endpoint. It is free and needs no key, but:

- NSE/BSE data from Yahoo is typically **delayed up to 15 minutes**.
- It is unofficial, so it can rate-limit or change without notice.
- It is fine for personal use. It is not licensed for redistribution.

For true tick-level real time, plug a broker feed into the `MarketDataProvider` interface in `lib/data.ts` (Zerodha Kite Connect, Upstox, Angel One SmartAPI, Dhan). Each of these needs your own API key and daily login/token handling, so keep secrets in Vercel environment variables, never in the repo. The rest of the app only needs `candles + meta`, so nothing else changes.

## Project layout

```
app/page.tsx              dashboard (polling, watchlist, filters, alerts, signal log)
app/api/analyze/route.ts  batch endpoint: ?symbols=RELIANCE,TCS&tf=1d|1h|15m
lib/indicators.ts         SMA, EMA, RSI, MACD, Bollinger, ATR, ADX, Stochastic
lib/signals.ts            scoring + BUY/SELL/HOLD/WATCH classification + risk levels
lib/data.ts               provider interface + Yahoo implementation
lib/market.ts             symbol normalisation, NSE market hours (IST)
components/               detail drawer and chart
tests/                    vitest unit tests
```

## Symbols

Plain tickers become NSE (`RELIANCE` -> `RELIANCE.NS`). Also accepted: `NSE:TCS`, `BSE:500325`, `INFY.BO`, indices like `^NSEI` and `^NSEBANK`, and `US:AAPL` for non-Indian tickers.

## Alerts

Turn on **Alerts** to get a browser notification whenever a stock changes signal (for example WATCH to BUY). Changes are also listed in the Signal changes panel. This works while the page is open.

## Good next steps

1. Licensed live feed via a broker API (see above).
2. Always-on alerts when the page is closed: a scheduled GitHub Action calling a `/api/scan` route that posts to Telegram. This needs a small store (Vercel KV or Upstash) to remember the previous signal.
3. Fundamentals (P/E, ROE, debt, promoter holding) from a source such as Screener.in exports or a paid API, added as extra factors.
4. Backtest the rules on history before trusting them with real money.

## Disclaimer

Signals are rule-based technical indicators for decision support. They are not investment advice and can be wrong. Always verify the live price with your broker and manage risk.
