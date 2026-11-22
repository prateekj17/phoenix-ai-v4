import { NextRequest, NextResponse } from 'next/server';
import { getProvider } from '@/lib/data';
import { isMarketOpenIST, normalizeSymbol } from '@/lib/market';
import { analyze } from '@/lib/signals';
import type { AnalysisResult, Timeframe } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_SYMBOLS = 40;
const CACHE_MS = 10_000;
const cache = new Map<string, { at: number; value: AnalysisResult }>();

async function one(symbol: string, tf: Timeframe): Promise<AnalysisResult> {
  const key = `${symbol}|${tf}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  let value: AnalysisResult;
  try {
    const { candles, meta } = await getProvider().fetch(symbol, tf);
    value = analyze(candles, {
      symbol,
      timeframe: tf,
      meta,
      partialLastBar: tf === '1d' && isMarketOpenIST(),
    });
  } catch (e) {
    value = { symbol, error: e instanceof Error ? e.message : 'Unknown error' };
  }
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  return value;
}

async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const idx = next++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const tfRaw = sp.get('tf');
  const tf: Timeframe = tfRaw === '1h' || tfRaw === '15m' ? tfRaw : '1d';
  const symbols = Array.from(
    new Set(
      (sp.get('symbols') ?? '')
        .split(',')
        .map(normalizeSymbol)
        .filter(Boolean),
    ),
  ).slice(0, MAX_SYMBOLS);

  if (symbols.length === 0) {
    return NextResponse.json({ error: 'Pass ?symbols=RELIANCE,TCS' }, { status: 400 });
  }

  const results = await pool(symbols, 6, (s) => one(s, tf));
  return NextResponse.json(
    { results, fetchedAt: Date.now(), marketOpen: isMarketOpenIST() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
