import { adx, atr, bollinger, macd, rsi, sma, stochastic } from './indicators';
import { istDayKey } from './market';
import type { Analysis, Candle, Factor, Levels, QuoteMeta, SignalLabel, Timeframe } from './types';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const nn = (x: number | null | undefined): x is number => x !== null && x !== undefined && Number.isFinite(x);

export const MIN_BARS = 60;

export interface AnalyzeOptions {
  symbol: string;
  timeframe: Timeframe;
  meta?: QuoteMeta;
  /** True when the final candle is still forming (e.g. daily bar during market hours). */
  partialLastBar?: boolean;
}

/**
 * Turn candles into a BUY / SELL / HOLD / WATCH call.
 *
 * Ten transparent factors each contribute points (positive = bullish). The sum is
 * normalised to -100..+100. BUY/SELL need a strong score AND trend agreement;
 * WATCH means "not actionable yet but something is happening"; HOLD is neutral.
 */
export function analyze(candles: Candle[], opts: AnalyzeOptions): Analysis {
  const n = candles.length;
  if (n < MIN_BARS) throw new Error(`Not enough history (${n} bars, need ${MIN_BARS})`);

  const o = candles;
  const h = o.map((x) => x.h);
  const l = o.map((x) => x.l);
  const c = o.map((x) => x.c);
  const v = o.map((x) => x.v);
  const i = n - 1;
  const close = c[i];

  // ---- previous close (for day change)
  let prevClose = c[i - 1];
  if (opts.timeframe !== '1d') {
    const today = istDayKey(o[i].t);
    for (let j = i - 1; j >= 0; j--) {
      if (istDayKey(o[j].t) !== today) {
        prevClose = c[j];
        break;
      }
    }
  }

  // ---- indicators
  const sma20 = sma(c, 20);
  const sma50 = sma(c, 50);
  const sma200 = sma(c, 200);
  const rsiA = rsi(c, 14);
  const m = macd(c);
  const bb = bollinger(c, 20, 2);
  const atrA = atr(h, l, c, 14);
  const adxA = adx(h, l, c, 14);
  const st = stochastic(h, l, c, 14, 3);

  const s20 = sma20[i];
  const s50 = sma50[i];
  const s200 = sma200[i];
  const rsiNow = rsiA[i];
  const rsiPrev = rsiA[i - 1];
  const histNow = m.hist[i];
  const histPrev = m.hist[i - 1];
  const atrNow = atrA[i];
  const adxNow = adxA[i];
  const pctB = bb.pctB[i];
  const kNow = st.k[i];
  const dNow = st.d[i];

  // volume ratio vs the prior 20 completed bars
  const vi = opts.partialLastBar ? i - 1 : i;
  let volRatio: number | null = null;
  if (vi >= 21) {
    let s = 0;
    for (let j = vi - 20; j < vi; j++) s += v[j];
    const avg = s / 20;
    volRatio = avg > 0 ? v[vi] / avg : null;
  }

  // 52-week range (prefer provider meta, else derive from the data we have)
  const lookback = opts.timeframe === '1d' ? Math.min(n, 252) : n;
  const high52 = opts.meta?.high52 ?? Math.max(...h.slice(n - lookback));
  const low52 = opts.meta?.low52 ?? Math.min(...l.slice(n - lookback));
  const distHigh = high52 > 0 ? ((high52 - close) / high52) * 100 : null;

  // ---- factors
  const factors: Factor[] = [];
  const add = (name: string, score: number, max: number, note: string) =>
    factors.push({ name, score: round(score, 1), max, note });

  // 1-3: trend structure
  if (nn(s50)) add('Price vs 50-day avg', close > s50 ? 8 : -8, 8, close > s50 ? 'Trading above 50-bar average' : 'Trading below 50-bar average');
  if (nn(s50) && nn(s200)) add('50 vs 200 average', s50 > s200 ? 8 : -8, 8, s50 > s200 ? 'Golden-cross structure (50 above 200)' : 'Death-cross structure (50 below 200)');
  else if (nn(s20) && nn(s50)) add('20 vs 50 average', s20 > s50 ? 8 : -8, 8, s20 > s50 ? 'Short-term average above medium-term' : 'Short-term average below medium-term');
  if (nn(s20)) add('Price vs 20-day avg', close > s20 ? 4 : -4, 4, close > s20 ? 'Holding above short-term average' : 'Under short-term average');

  // 4: trend strength / direction
  if (adxNow) {
    const dir = adxNow.plusDI >= adxNow.minusDI ? 1 : -1;
    const strength = adxNow.adx >= 30 ? 5 : adxNow.adx >= 20 ? 3 : 0;
    add('Trend strength (ADX)', dir * strength, 5, strength === 0 ? `ADX ${round(adxNow.adx, 0)}: no clear trend` : `ADX ${round(adxNow.adx, 0)}: ${dir > 0 ? 'buyers' : 'sellers'} in control`);
  }

  // 5: RSI
  if (nn(rsiNow)) {
    let s: number;
    let note: string;
    if (rsiNow >= 70) {
      s = 10 - ((rsiNow - 70) / 30) * 14;
      note = `RSI ${round(rsiNow, 0)}: overbought, upside may be stretched`;
    } else if (rsiNow >= 50) {
      s = ((rsiNow - 50) / 20) * 10;
      note = `RSI ${round(rsiNow, 0)}: bullish momentum`;
    } else if (rsiNow > 30) {
      s = -((50 - rsiNow) / 20) * 10;
      note = `RSI ${round(rsiNow, 0)}: bearish momentum`;
    } else {
      s = -10 + ((30 - rsiNow) / 30) * 14;
      note = `RSI ${round(rsiNow, 0)}: oversold, bounce possible`;
    }
    add('RSI (14)', s, 10, note);
  }

  // 6: MACD
  if (nn(histNow) && nn(m.line[i])) {
    let s = histNow > 0 ? 6 : -6;
    if (nn(histPrev)) s += histNow > histPrev ? 4 : -4;
    s += (m.line[i] as number) > 0 ? 2 : -2;
    const rising = nn(histPrev) && histNow > histPrev;
    add('MACD', s, 12, `Histogram ${histNow > 0 ? 'positive' : 'negative'} and ${rising ? 'rising' : 'falling'}`);
  }

  // 7: Stochastic
  if (nn(kNow) && nn(dNow)) {
    let s = kNow > dNow ? 4 : -4;
    if (kNow < 20) s += 4;
    else if (kNow > 80) s -= 4;
    add('Stochastic', s, 8, `%K ${round(kNow, 0)} ${kNow > dNow ? 'above' : 'below'} %D${kNow < 20 ? ', oversold' : kNow > 80 ? ', overbought' : ''}`);
  }

  // 8: band stretch (contrarian, small weight)
  if (nn(pctB)) {
    add('Band stretch', clamp((0.5 - pctB) * 12, -6, 6), 6, pctB > 1 ? 'Above upper Bollinger band' : pctB < 0 ? 'Below lower Bollinger band' : `Inside bands (${round(pctB * 100, 0)}% of range)`);
  }

  // 9: volume confirmation
  if (nn(volRatio)) {
    const dayUp = close >= prevClose ? 1 : -1;
    const s = dayUp * clamp((volRatio - 1) * 10, 0, 10);
    add('Volume confirmation', s, 10, `Volume ${round(volRatio, 1)}x 20-bar average on a ${dayUp > 0 ? 'up' : 'down'} move`);
  }

  // 10: position in 52-week range
  if (nn(distHigh)) {
    let s = 0;
    if (distHigh < 5) s = 6;
    else if (distHigh < 15) s = 3;
    else if (distHigh > 40) s = -6;
    else if (distHigh > 25) s = -3;
    if (high52 > low52 && close - low52 < (high52 - low52) * 0.1) s -= 2;
    else if (distHigh < 2) s += 2;
    add('52-week position', s, 8, `${round(distHigh, 1)}% below 52-week high`);
  }

  const raw = factors.reduce((a, f) => a + f.score, 0);
  const maxRaw = factors.reduce((a, f) => a + f.max, 0);
  const score = Math.round(clamp((raw / maxRaw) * 100, -100, 100));

  const trendScore = factors
    .filter((f) => /average|ADX/.test(f.name))
    .reduce((a, f) => a + f.score, 0);

  // ---- event triggers (what puts something on WATCH)
  const triggers: string[] = [];
  if (nn(histNow) && nn(histPrev)) {
    const h2 = m.hist[i - 2];
    if (histPrev <= 0 && histNow > 0) triggers.push('MACD just crossed bullish');
    else if (histPrev >= 0 && histNow < 0) triggers.push('MACD just crossed bearish');
    else if (nn(h2) && h2 <= 0 && histPrev > 0 && histNow > 0) triggers.push('MACD crossed bullish last bar');
    else if (nn(h2) && h2 >= 0 && histPrev < 0 && histNow < 0) triggers.push('MACD crossed bearish last bar');
  }
  if (nn(rsiNow) && nn(rsiPrev)) {
    if (rsiPrev < 30 && rsiNow >= 30) triggers.push('RSI recovering out of oversold');
    if (rsiPrev > 70 && rsiNow <= 70) triggers.push('RSI rolling over from overbought');
  }
  const bwNow = bb.bandwidth[i];
  if (nn(bwNow)) {
    const window = bb.bandwidth.slice(Math.max(0, n - 120), n).filter(nn);
    if (window.length >= 60) {
      const rank = window.filter((x) => x <= bwNow).length / window.length;
      if (rank <= 0.1) triggers.push('Volatility squeeze: breakout setup forming');
    }
  }
  if (n > 21) {
    const priorHigh = Math.max(...h.slice(n - 21, n - 1));
    const priorLow = Math.min(...l.slice(n - 21, n - 1));
    const strongVol = nn(volRatio) && volRatio >= 1.3;
    if (close > priorHigh) triggers.push(strongVol ? '20-bar high breakout on strong volume' : '20-bar high breakout (volume unconfirmed)');
    if (close < priorLow) triggers.push(strongVol ? '20-bar low breakdown on strong volume' : '20-bar low breakdown (volume unconfirmed)');
  }
  for (let b = 0; b < 5; b++) {
    const a1 = sma50[i - b];
    const a0 = sma200[i - b - 1];
    const e1 = sma200[i - b];
    const e0 = sma50[i - b - 1];
    if (nn(a1) && nn(a0) && nn(e1) && nn(e0)) {
      if (e0 <= a0 && a1 > e1) { triggers.push('Golden cross (50 over 200) in last 5 bars'); break; }
      if (e0 >= a0 && a1 < e1) { triggers.push('Death cross (50 under 200) in last 5 bars'); break; }
    }
  }
  if (nn(rsiNow) && rsiNow >= 80) triggers.push('RSI above 80: extended, avoid chasing');
  if (nn(rsiNow) && rsiNow <= 20) triggers.push('RSI below 20: capitulation zone');

  // ---- classification
  const extended = nn(rsiNow) && rsiNow >= 80;
  let signal: SignalLabel;
  if (score >= 30 && trendScore > 0 && !extended) signal = 'BUY';
  else if (score <= -30 && trendScore < 0) signal = 'SELL';
  else if (triggers.length > 0 || Math.abs(score) >= 15) signal = 'WATCH';
  else signal = 'HOLD';

  // ---- confidence = strength + factor agreement
  const nonZero = factors.filter((f) => f.score !== 0);
  const agree = nonZero.length ? nonZero.filter((f) => Math.sign(f.score) === Math.sign(score)).length / nonZero.length : 0;
  const confidence = Math.round(clamp(0.6 * Math.min(100, Math.abs(score) * 1.6) + 0.4 * agree * 100, 0, 100));

  // ---- reasons: the factors that moved the score most, in the score's direction
  const reasons = [...factors]
    .filter((f) => Math.sign(f.score) === Math.sign(score) && Math.abs(f.score) >= f.max * 0.4)
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 4)
    .map((f) => f.note);
  if (signal === 'HOLD' && reasons.length === 0) reasons.push('Mixed signals, no edge either way');

  // ---- risk levels (ATR-based, 1.5x ATR risk, 1.5R and 3R targets)
  let levels: Levels | null = null;
  if (nn(atrNow) && signal !== 'HOLD') {
    const risk = 1.5 * atrNow;
    const dir = score >= 0 ? 1 : -1;
    levels = {
      stop: round(close - dir * risk),
      target1: round(close + dir * 1.5 * risk),
      target2: round(close + dir * 3 * risk),
      riskPct: round((risk / close) * 100, 2),
    };
  }

  const tail = Math.min(n, 120);
  const slice = <T,>(a: T[]) => a.slice(n - tail);
  const r = (x: number | null | undefined, d = 2) => (nn(x) ? round(x, d) : null);

  return {
    symbol: opts.symbol,
    name: opts.meta?.name,
    currency: opts.meta?.currency,
    timeframe: opts.timeframe,
    price: round(close),
    prevClose: round(prevClose),
    change: round(close - prevClose),
    changePct: round(((close - prevClose) / prevClose) * 100),
    asOf: o[i].t,
    signal,
    score,
    confidence,
    reasons,
    triggers,
    factors,
    levels,
    stats: {
      rsi: r(rsiNow, 1),
      macdHist: r(histNow, 3),
      adx: r(adxNow?.adx, 1),
      atr: r(atrNow),
      atrPct: nn(atrNow) ? round((atrNow / close) * 100, 2) : null,
      sma20: r(s20),
      sma50: r(s50),
      sma200: r(s200),
      bbPct: nn(pctB) ? round(pctB * 100, 0) : null,
      stochK: r(kNow, 0),
      volRatio: r(volRatio, 2),
      high52: r(high52),
      low52: r(low52),
      distHigh52Pct: r(distHigh, 1),
    },
    series: {
      t: slice(o.map((x) => x.t)),
      c: slice(c).map((x) => round(x)),
      sma20: slice(sma20).map((x) => r(x)),
      sma50: slice(sma50).map((x) => r(x)),
    },
  };
}
