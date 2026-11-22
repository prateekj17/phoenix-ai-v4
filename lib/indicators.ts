// Pure indicator maths. Every function returns an array aligned 1:1 with the
// input, using null where there is not enough history yet.

export type N = number | null;

export function sma(v: number[], p: number): N[] {
  const out: N[] = new Array(v.length).fill(null);
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    sum += v[i];
    if (i >= p) sum -= v[i - p];
    if (i >= p - 1) out[i] = sum / p;
  }
  return out;
}

export function ema(v: number[], p: number): N[] {
  const out: N[] = new Array(v.length).fill(null);
  if (v.length < p) return out;
  const k = 2 / (p + 1);
  let prev = 0;
  for (let i = 0; i < p; i++) prev += v[i];
  prev /= p;
  out[p - 1] = prev;
  for (let i = p; i < v.length; i++) {
    prev = v[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's RSI. */
export function rsi(v: number[], p = 14): N[] {
  const out: N[] = new Array(v.length).fill(null);
  if (v.length <= p) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= p; i++) {
    const d = v[i] - v[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= p;
  loss /= p;
  out[p] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = p + 1; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    gain = (gain * (p - 1) + Math.max(d, 0)) / p;
    loss = (loss * (p - 1) + Math.max(-d, 0)) / p;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function macd(v: number[], fast = 12, slow = 26, signalP = 9) {
  const ef = ema(v, fast);
  const es = ema(v, slow);
  const line: N[] = v.map((_, i) => (ef[i] !== null && es[i] !== null ? (ef[i] as number) - (es[i] as number) : null));
  const signal: N[] = new Array(v.length).fill(null);
  const start = line.findIndex((x) => x !== null);
  if (start >= 0) {
    const sig = ema(line.slice(start) as number[], signalP);
    for (let i = 0; i < sig.length; i++) signal[start + i] = sig[i];
  }
  const hist: N[] = line.map((x, i) => (x !== null && signal[i] !== null ? x - (signal[i] as number) : null));
  return { line, signal, hist };
}

export function bollinger(v: number[], p = 20, k = 2) {
  const mid = sma(v, p);
  const upper: N[] = new Array(v.length).fill(null);
  const lower: N[] = new Array(v.length).fill(null);
  const pctB: N[] = new Array(v.length).fill(null);
  const bandwidth: N[] = new Array(v.length).fill(null);
  for (let i = p - 1; i < v.length; i++) {
    const m = mid[i] as number;
    let s = 0;
    for (let j = i - p + 1; j <= i; j++) s += (v[j] - m) ** 2;
    const sd = Math.sqrt(s / p);
    upper[i] = m + k * sd;
    lower[i] = m - k * sd;
    const width = (upper[i] as number) - (lower[i] as number);
    pctB[i] = width === 0 ? 0.5 : (v[i] - (lower[i] as number)) / width;
    bandwidth[i] = m === 0 ? null : width / m;
  }
  return { mid, upper, lower, pctB, bandwidth };
}

/** Wilder's Average True Range. */
export function atr(h: number[], l: number[], c: number[], p = 14): N[] {
  const n = c.length;
  const out: N[] = new Array(n).fill(null);
  if (n <= p) return out;
  const tr: number[] = [0];
  for (let i = 1; i < n; i++) {
    tr.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
  }
  let a = 0;
  for (let i = 1; i <= p; i++) a += tr[i];
  a /= p;
  out[p] = a;
  for (let i = p + 1; i < n; i++) {
    a = (a * (p - 1) + tr[i]) / p;
    out[i] = a;
  }
  return out;
}

export interface AdxPoint {
  adx: number;
  plusDI: number;
  minusDI: number;
}

/** Wilder's ADX with +DI / -DI. */
export function adx(h: number[], l: number[], c: number[], p = 14): (AdxPoint | null)[] {
  const n = c.length;
  const out: (AdxPoint | null)[] = new Array(n).fill(null);
  if (n < 2 * p + 1) return out;

  const tr: number[] = [];
  const pdm: number[] = [];
  const mdm: number[] = [];
  for (let i = 1; i < n; i++) {
    const up = h[i] - h[i - 1];
    const dn = l[i - 1] - l[i];
    pdm.push(up > dn && up > 0 ? up : 0);
    mdm.push(dn > up && dn > 0 ? dn : 0);
    tr.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
  }

  let sTR = 0;
  let sP = 0;
  let sM = 0;
  for (let j = 0; j < p; j++) {
    sTR += tr[j];
    sP += pdm[j];
    sM += mdm[j];
  }

  const dxs: number[] = [];
  const dis: { p: number; m: number }[] = [];
  const push = () => {
    const pdi = sTR === 0 ? 0 : (100 * sP) / sTR;
    const mdi = sTR === 0 ? 0 : (100 * sM) / sTR;
    const sum = pdi + mdi;
    dxs.push(sum === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / sum);
    dis.push({ p: pdi, m: mdi });
  };
  push(); // corresponds to bar index p
  for (let j = p; j < tr.length; j++) {
    sTR = sTR - sTR / p + tr[j];
    sP = sP - sP / p + pdm[j];
    sM = sM - sM / p + mdm[j];
    push(); // bar index j + 1
  }

  // dxs[k] belongs to bar index p + k
  let a = 0;
  for (let k = 0; k < p; k++) a += dxs[k];
  a /= p;
  out[2 * p - 1] = { adx: a, plusDI: dis[p - 1].p, minusDI: dis[p - 1].m };
  for (let k = p; k < dxs.length; k++) {
    a = (a * (p - 1) + dxs[k]) / p;
    out[p + k] = { adx: a, plusDI: dis[k].p, minusDI: dis[k].m };
  }
  return out;
}

export function stochastic(h: number[], l: number[], c: number[], p = 14, d = 3) {
  const n = c.length;
  const k: N[] = new Array(n).fill(null);
  for (let i = p - 1; i < n; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - p + 1; j <= i; j++) {
      hh = Math.max(hh, h[j]);
      ll = Math.min(ll, l[j]);
    }
    k[i] = hh === ll ? 50 : ((c[i] - ll) / (hh - ll)) * 100;
  }
  const dLine: N[] = new Array(n).fill(null);
  for (let i = p - 1 + d - 1; i < n; i++) {
    let s = 0;
    for (let j = i - d + 1; j <= i; j++) s += k[j] as number;
    dLine[i] = s / d;
  }
  return { k, d: dLine };
}

export const last = <T,>(a: T[], back = 0): T | undefined => a[a.length - 1 - back];
