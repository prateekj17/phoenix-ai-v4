import type { Candle, QuoteMeta, Timeframe } from './types';

export interface MarketData {
  candles: Candle[];
  meta: QuoteMeta;
}

/**
 * Swap this interface to plug in a licensed real-time feed (Zerodha Kite, Upstox,
 * Angel One SmartAPI, Dhan, etc.). Everything downstream only needs candles + meta.
 */
export interface MarketDataProvider {
  name: string;
  fetch(symbol: string, tf: Timeframe): Promise<MarketData>;
}

const RANGES: Record<Timeframe, { range: string; interval: string }> = {
  '1d': { range: '2y', interval: '1d' },
  '1h': { range: '6mo', interval: '60m' },
  '15m': { range: '1mo', interval: '15m' },
};

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json',
};

export const yahooProvider: MarketDataProvider = {
  name: 'yahoo',
  async fetch(symbol, tf) {
    const { range, interval } = RANGES[tf];
    let lastErr: unknown;
    for (const host of ['query1', 'query2']) {
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;
      try {
        const res = await fetch(url, { headers: HEADERS, cache: 'no-store', signal: AbortSignal.timeout(10_000) });
        if (!res.ok) throw new Error(`Yahoo returned HTTP ${res.status}`);
        const json = await res.json();
        const err = json?.chart?.error;
        if (err) throw new Error(err.description || 'Symbol not found');
        const r = json?.chart?.result?.[0];
        if (!r?.timestamp) throw new Error('No price data returned');

        const q = r.indicators.quote[0];
        const candles: Candle[] = [];
        for (let k = 0; k < r.timestamp.length; k++) {
          const c = q.close?.[k];
          const hi = q.high?.[k];
          const lo = q.low?.[k];
          const op = q.open?.[k];
          if ([c, hi, lo, op].some((x) => x === null || x === undefined)) continue;
          candles.push({ t: r.timestamp[k], o: op, h: hi, l: lo, c, v: q.volume?.[k] ?? 0 });
        }
        const m = r.meta ?? {};
        return {
          candles,
          meta: {
            name: m.longName || m.shortName,
            currency: m.currency,
            exchange: m.exchangeName,
            high52: m.fiftyTwoWeekHigh,
            low52: m.fiftyTwoWeekLow,
            marketTime: m.regularMarketTime,
          },
        };
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('Data fetch failed');
  },
};

export function getProvider(): MarketDataProvider {
  // Add more providers here and select with DATA_PROVIDER=<name> in Vercel env vars.
  return yahooProvider;
}
