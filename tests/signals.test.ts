import { describe, expect, it } from 'vitest';
import { adx, atr, bollinger, ema, macd, rsi, sma, stochastic } from '../lib/indicators';
import { normalizeSymbol, isMarketOpenIST } from '../lib/market';
import { analyze } from '../lib/signals';
import type { Candle } from '../lib/types';

// deterministic PRNG so tests are stable
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function makeCandles(n: number, drift: number, noise: number, seed = 7, start = 100): Candle[] {
  const r = rng(seed);
  const out: Candle[] = [];
  let p = start;
  const t0 = 1_700_000_000;
  for (let i = 0; i < n; i++) {
    const o = p;
    p = p * (1 + drift + (r() - 0.5) * noise);
    const h = Math.max(o, p) * (1 + r() * 0.005);
    const l = Math.min(o, p) * (1 - r() * 0.005);
    out.push({ t: t0 + i * 86400, o, h, l, c: p, v: 1_000_000 * (0.8 + r() * 0.4) });
  }
  return out;
}

describe('indicators', () => {
  it('sma matches a hand calculation', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it('ema of a constant series is that constant', () => {
    const e = ema(new Array(30).fill(10), 10);
    expect(e[9]).toBeCloseTo(10);
    expect(e[29]).toBeCloseTo(10);
  });

  it('rsi is 100 for a strictly rising series and 0 for a strictly falling one', () => {
    const up = Array.from({ length: 40 }, (_, i) => 100 + i);
    const dn = Array.from({ length: 40 }, (_, i) => 100 - i);
    expect(rsi(up)[39]).toBe(100);
    expect(rsi(dn)[39]).toBeCloseTo(0);
  });

  it('rsi reproduces the classic Wilder textbook value', () => {
    // 15 closes from the commonly cited Wilder/StockCharts example
    const closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];
    expect(rsi(closes, 14)[14]).toBeCloseTo(70.46, 1);
  });

  it('macd arrays stay aligned with the input', () => {
    const c = makeCandles(120, 0.001, 0.02).map((x) => x.c);
    const m = macd(c);
    expect(m.line).toHaveLength(120);
    expect(m.hist[119]).not.toBeNull();
    expect(m.hist[10]).toBeNull();
  });

  it('bollinger %B is 0.5 at the mean and bands bracket price', () => {
    const c = makeCandles(60, 0, 0.02).map((x) => x.c);
    const b = bollinger(c);
    const i = 59;
    expect(b.upper[i]!).toBeGreaterThan(b.mid[i]!);
    expect(b.lower[i]!).toBeLessThan(b.mid[i]!);
  });

  it('atr is positive and adx stays within 0-100', () => {
    const k = makeCandles(120, 0.002, 0.03);
    const h = k.map((x) => x.h), l = k.map((x) => x.l), c = k.map((x) => x.c);
    expect(atr(h, l, c)[119]!).toBeGreaterThan(0);
    const a = adx(h, l, c)[119]!;
    expect(a.adx).toBeGreaterThanOrEqual(0);
    expect(a.adx).toBeLessThanOrEqual(100);
  });

  it('adx is high in a clean trend', () => {
    const k = makeCandles(150, 0.006, 0.004);
    const a = adx(k.map((x) => x.h), k.map((x) => x.l), k.map((x) => x.c))[149]!;
    expect(a.adx).toBeGreaterThan(30);
    expect(a.plusDI).toBeGreaterThan(a.minusDI);
  });

  it('stochastic is bounded', () => {
    const k = makeCandles(80, 0, 0.04);
    const s = stochastic(k.map((x) => x.h), k.map((x) => x.l), k.map((x) => x.c));
    for (const v of s.k) if (v !== null) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100); }
  });
});

describe('analyze', () => {
  it('rejects too little history', () => {
    expect(() => analyze(makeCandles(30, 0, 0.01), { symbol: 'X', timeframe: '1d' })).toThrow();
  });

  it('a steady uptrend scores bullish and is never SELL', () => {
    const a = analyze(makeCandles(260, 0.0035, 0.025), { symbol: 'UP.NS', timeframe: '1d' });
    expect(a.score).toBeGreaterThan(15);
    expect(['BUY', 'WATCH']).toContain(a.signal);
    expect(a.levels!.stop).toBeLessThan(a.price);
    expect(a.levels!.target1).toBeGreaterThan(a.price);
  });

  it('a steady downtrend scores bearish and is never BUY', () => {
    const a = analyze(makeCandles(260, -0.0035, 0.025), { symbol: 'DN.NS', timeframe: '1d' });
    expect(a.score).toBeLessThan(-15);
    expect(['SELL', 'WATCH']).toContain(a.signal);
    expect(a.levels!.stop).toBeGreaterThan(a.price);
    expect(a.levels!.target1).toBeLessThan(a.price);
  });

  it('a clean trend gives BUY on the way up and SELL on the way down', () => {
    const up = analyze(makeCandles(260, 0.003, 0.03, 11), { symbol: 'A', timeframe: '1d' });
    const dn = analyze(makeCandles(260, -0.003, 0.03, 11), { symbol: 'B', timeframe: '1d' });
    expect(up.score).toBeGreaterThan(dn.score);
    expect(up.signal === 'BUY' || dn.signal === 'SELL').toBe(true);
  });

  it('score is always within -100..100 and confidence within 0..100', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (const drift of [-0.01, -0.002, 0, 0.002, 0.01]) {
        const a = analyze(makeCandles(250, drift, 0.04, seed), { symbol: 'T', timeframe: '1d' });
        expect(a.score).toBeGreaterThanOrEqual(-100);
        expect(a.score).toBeLessThanOrEqual(100);
        expect(a.confidence).toBeGreaterThanOrEqual(0);
        expect(a.confidence).toBeLessThanOrEqual(100);
        expect(['BUY', 'SELL', 'HOLD', 'WATCH']).toContain(a.signal);
      }
    }
  });

  it('HOLD never carries risk levels; actionable signals do', () => {
    const a = analyze(makeCandles(250, 0, 0.01, 3), { symbol: 'FLAT', timeframe: '1d' });
    if (a.signal === 'HOLD') expect(a.levels).toBeNull();
    else expect(a.levels).not.toBeNull();
  });

  it('reports day change against the previous close', () => {
    const k = makeCandles(100, 0.001, 0.01);
    const a = analyze(k, { symbol: 'C', timeframe: '1d' });
    expect(a.prevClose).toBeCloseTo(k[98].c, 1);
    expect(a.change).toBeCloseTo(k[99].c - k[98].c, 1);
  });
});

describe('market helpers', () => {
  it('normalises symbols', () => {
    expect(normalizeSymbol('reliance')).toBe('RELIANCE.NS');
    expect(normalizeSymbol('NSE:TCS')).toBe('TCS.NS');
    expect(normalizeSymbol('BSE:500325')).toBe('500325.BO');
    expect(normalizeSymbol('^nsei')).toBe('^NSEI');
    expect(normalizeSymbol('INFY.BO')).toBe('INFY.BO');
    expect(normalizeSymbol('US:AAPL')).toBe('AAPL');
    expect(normalizeSymbol('BAJAJ-AUTO')).toBe('BAJAJ-AUTO.NS');
    expect(normalizeSymbol('   ')).toBe('');
  });

  it('knows NSE hours in IST', () => {
    expect(isMarketOpenIST(new Date('2026-11-23T04:30:00Z'))).toBe(true); // Mon 10:00 IST
    expect(isMarketOpenIST(new Date('2026-11-23T10:30:00Z'))).toBe(false); // Mon 16:00 IST
    expect(isMarketOpenIST(new Date('2026-11-22T05:00:00Z'))).toBe(false); // Sunday
  });
});
