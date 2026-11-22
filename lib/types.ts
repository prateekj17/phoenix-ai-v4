export type Timeframe = '1d' | '1h' | '15m';
export type SignalLabel = 'BUY' | 'SELL' | 'HOLD' | 'WATCH';

export interface Candle {
  t: number; // unix seconds
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface QuoteMeta {
  name?: string;
  currency?: string;
  exchange?: string;
  high52?: number;
  low52?: number;
  marketTime?: number;
}

export interface Factor {
  name: string;
  score: number;
  max: number;
  note: string;
}

export interface Levels {
  stop: number;
  target1: number;
  target2: number;
  riskPct: number;
}

export interface Stats {
  rsi: number | null;
  macdHist: number | null;
  adx: number | null;
  atr: number | null;
  atrPct: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  bbPct: number | null;
  stochK: number | null;
  volRatio: number | null;
  high52: number | null;
  low52: number | null;
  distHigh52Pct: number | null;
}

export interface Analysis {
  symbol: string;
  name?: string;
  currency?: string;
  timeframe: Timeframe;
  price: number;
  prevClose: number;
  change: number;
  changePct: number;
  asOf: number;
  signal: SignalLabel;
  score: number; // -100 .. +100
  confidence: number; // 0 .. 100
  reasons: string[];
  triggers: string[];
  factors: Factor[];
  levels: Levels | null;
  stats: Stats;
  series: {
    t: number[];
    c: number[];
    sma20: (number | null)[];
    sma50: (number | null)[];
  };
}

export interface AnalysisError {
  symbol: string;
  error: string;
}

export type AnalysisResult = Analysis | AnalysisError;

export function isError(r: AnalysisResult): r is AnalysisError {
  return 'error' in r;
}
