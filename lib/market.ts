// Default watchlist (NSE). Plain tickers get ".NS" appended automatically.
export const DEFAULT_WATCHLIST = [
  'RELIANCE',
  'TCS',
  'HDFCBANK',
  'INFY',
  'ICICIBANK',
  'SBIN',
  'BHARTIARTL',
  'ITC',
  'LT',
  'AXISBANK',
  'MARUTI',
  '^NSEI',
];

/**
 * Turn what the user types into a Yahoo Finance symbol.
 *   RELIANCE      -> RELIANCE.NS
 *   NSE:TCS       -> TCS.NS
 *   BSE:500325    -> 500325.BO
 *   RELIANCE.BO   -> RELIANCE.BO (unchanged)
 *   ^NSEI         -> ^NSEI (indices unchanged)
 *   US:AAPL       -> AAPL (explicit non-Indian ticker)
 */
export function normalizeSymbol(input: string): string {
  let s = input.trim().toUpperCase();
  if (!s) return '';
  if (s.startsWith('US:')) return s.slice(3);
  if (s.startsWith('NSE:')) s = s.slice(4) + '.NS';
  else if (s.startsWith('BSE:')) s = s.slice(4) + '.BO';
  if (s.startsWith('^') || s.endsWith('.NS') || s.endsWith('.BO') || s.includes('=')) return s;
  return s + '.NS';
}

export function displaySymbol(sym: string): string {
  return sym.replace(/\.(NS|BO)$/, '');
}

/** NSE/BSE cash session: Mon-Fri 09:15-15:30 IST. Exchange holidays are not modelled. */
export function isMarketOpenIST(now: Date = new Date()): boolean {
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
  const day = ist.getUTCDay();
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return day >= 1 && day <= 5 && mins >= 9 * 60 + 15 && mins < 15 * 60 + 30;
}

export function istDayKey(unixSeconds: number): string {
  return new Date(unixSeconds * 1000 + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}
