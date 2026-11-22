'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Detail from '@/components/Detail';
import { DEFAULT_WATCHLIST, displaySymbol, isMarketOpenIST, normalizeSymbol } from '@/lib/market';
import { isError, type Analysis, type AnalysisResult, type SignalLabel, type Timeframe } from '@/lib/types';

type Filter = 'ALL' | SignalLabel;
type Sort = 'score' | 'abs' | 'change' | 'symbol';
interface LogEntry { id: string; t: number; symbol: string; from: SignalLabel; to: SignalLabel; price: number }

const LS_LIST = 'phoenix.watchlist.v4';
const LS_LOG = 'phoenix.log.v4';
const LABELS: SignalLabel[] = ['BUY', 'WATCH', 'HOLD', 'SELL'];

const fmt = (x: number, d = 2) => x.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });

export default function Home() {
  const [symbols, setSymbols] = useState<string[]>(DEFAULT_WATCHLIST);
  const [ready, setReady] = useState(false);
  const [tf, setTf] = useState<Timeframe>('1d');
  const [results, setResults] = useState<Record<string, AnalysisResult>>({});
  const [loading, setLoading] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [updated, setUpdated] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [sort, setSort] = useState<Sort>('abs');
  const [selected, setSelected] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [notify, setNotify] = useState(false);
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);

  const prev = useRef<Record<string, SignalLabel>>({});
  const inflight = useRef(false);

  // ---- persistence
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(LS_LIST) || 'null');
      if (Array.isArray(s) && s.length) setSymbols(s);
      const l = JSON.parse(localStorage.getItem(LS_LOG) || 'null');
      if (Array.isArray(l)) setLog(l);
    } catch { /* ignore */ }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(LS_LIST, JSON.stringify(symbols)); } catch { /* ignore */ }
  }, [symbols, ready]);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(LS_LOG, JSON.stringify(log.slice(0, 60))); } catch { /* ignore */ }
  }, [log, ready]);

  // ---- market clock
  useEffect(() => {
    const tick = () => setOpen(isMarketOpenIST());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  // ---- data loading
  const load = useCallback(async () => {
    if (inflight.current || symbols.length === 0) return;
    inflight.current = true;
    setLoading(true);
    try {
      const res = await fetch(`/api/analyze?symbols=${encodeURIComponent(symbols.join(','))}&tf=${tf}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const json: { results: AnalysisResult[]; fetchedAt: number } = await res.json();

      const map: Record<string, AnalysisResult> = {};
      const entries: LogEntry[] = [];
      for (const r of json.results) {
        map[r.symbol] = r;
        if (isError(r)) continue;
        const before = prev.current[r.symbol];
        if (before && before !== r.signal) {
          entries.push({ id: `${r.symbol}-${json.fetchedAt}`, t: json.fetchedAt, symbol: r.symbol, from: before, to: r.signal, price: r.price });
          if (notify && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification(`${displaySymbol(r.symbol)}: ${before} → ${r.signal}`, { body: `Price ${fmt(r.price)} · score ${r.score}` });
          }
        }
        prev.current[r.symbol] = r.signal;
      }
      setResults((old) => ({ ...old, ...map }));
      if (entries.length) setLog((l) => [...entries, ...l].slice(0, 60));
      setUpdated(json.fetchedAt);
      setFatal(null);
    } catch (e) {
      setFatal(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      inflight.current = false;
      setLoading(false);
    }
  }, [symbols, tf, notify]);

  // reset change-tracking when timeframe changes (signals differ per timeframe)
  useEffect(() => { prev.current = {}; setResults({}); }, [tf]);

  useEffect(() => {
    if (!ready) return;
    load();
    const id = setInterval(load, open ? 15_000 : 60_000);
    return () => clearInterval(id);
  }, [ready, load, open]);

  // ---- actions
  const add = () => {
    const raw = input.split(/[\s,]+/).map(normalizeSymbol).filter(Boolean);
    if (!raw.length) return;
    setSymbols((s) => Array.from(new Set([...s, ...raw])).slice(0, 40));
    setInput('');
  };
  const remove = (s: string) => {
    setSymbols((list) => list.filter((x) => x !== s));
    setResults((r) => { const n = { ...r }; delete n[s]; return n; });
    delete prev.current[s];
  };
  const toggleNotify = async () => {
    if (notify) return setNotify(false);
    if (typeof Notification === 'undefined') return alert('This browser does not support notifications.');
    const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    setNotify(p === 'granted');
  };

  // ---- derived
  const rows = useMemo(() => {
    const ok = symbols.map((s) => results[s]).filter((r): r is Analysis => !!r && !isError(r));
    const filtered = filter === 'ALL' ? ok : ok.filter((r) => r.signal === filter);
    const sorted = [...filtered];
    if (sort === 'score') sorted.sort((a, b) => b.score - a.score);
    else if (sort === 'abs') sorted.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
    else if (sort === 'change') sorted.sort((a, b) => b.changePct - a.changePct);
    else sorted.sort((a, b) => a.symbol.localeCompare(b.symbol));
    return sorted;
  }, [results, symbols, filter, sort]);

  const errors = symbols.map((s) => results[s]).filter((r): r is Extract<AnalysisResult, { error: string }> => !!r && isError(r));
  const counts = useMemo(() => {
    const c: Record<SignalLabel, number> = { BUY: 0, WATCH: 0, HOLD: 0, SELL: 0 };
    for (const s of symbols) { const r = results[s]; if (r && !isError(r)) c[r.signal]++; }
    return c;
  }, [results, symbols]);

  const sel = selected ? results[selected] : undefined;

  return (
    <main className="wrap">
      <div className="top">
        <div className="brand">Phoenix Signals<small>v4 · NSE/BSE</small></div>
        <div className="status">
          <span><span className={`dot ${open ? 'live' : ''}`} />{open ? 'Market open · refreshing every 15s' : 'Market closed · refreshing every 60s'}</span>
          {updated && <span>Updated {new Date(updated).toLocaleTimeString('en-IN')}</span>}
          {loading && <span>Loading…</span>}
        </div>
      </div>

      {fatal && <div className="err">Could not refresh: {fatal}</div>}

      <div className="bar">
        <div className="seg" role="group" aria-label="Timeframe">
          {(['1d', '1h', '15m'] as Timeframe[]).map((t) => (
            <button key={t} className={tf === t ? 'active' : ''} onClick={() => setTf(t)}>{t === '1d' ? 'Daily' : t}</button>
          ))}
        </div>
        <button className={`chip ${filter === 'ALL' ? 'active' : ''}`} onClick={() => setFilter('ALL')}>All {symbols.length}</button>
        {LABELS.map((l) => (
          <button key={l} className={`chip ${filter === l ? 'active' : ''}`} onClick={() => setFilter(filter === l ? 'ALL' : l)}>
            <span className={`pill ${l}`} style={{ minWidth: 0, padding: '0 8px', marginRight: 6 }}>{l}</span>{counts[l]}
          </button>
        ))}
        <span className="grow" />
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          <option value="abs">Strongest signal</option>
          <option value="score">Most bullish</option>
          <option value="change">Day change %</option>
          <option value="symbol">A–Z</option>
        </select>
        <button className={`btn ${notify ? 'primary' : ''}`} onClick={toggleNotify}>{notify ? 'Alerts on' : 'Alerts off'}</button>
        <button className="btn" onClick={load}>Refresh</button>
      </div>

      <form className="bar" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input className="add" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Add symbols: TATASTEEL, NSE:ZOMATO, BSE:500325, ^NSEBANK" style={{ flex: 1, minWidth: 220 }} />
        <button className="btn primary" type="submit">Add</button>
      </form>

      {errors.length > 0 && (
        <div className="err">
          {errors.map((e) => (
            <div key={e.symbol}>
              {displaySymbol(e.symbol)}: {e.error}{' '}
              <button className="x" onClick={() => remove(e.symbol)} title="Remove">✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="card scroll">
        <table>
          <thead>
            <tr>
              <th>Stock</th>
              <th style={{ textAlign: 'right' }}>Price</th>
              <th style={{ textAlign: 'right' }}>Day</th>
              <th>Signal</th>
              <th>Score</th>
              <th className="hide-m">RSI</th>
              <th className="hide-m">Stop</th>
              <th className="hide-m">Target 1</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const up = r.change >= 0;
              const w = Math.abs(r.score) / 2;
              return (
                <tr key={r.symbol} className="row" onClick={() => setSelected(r.symbol)}>
                  <td className="sym">{displaySymbol(r.symbol)}<small>{r.name}</small></td>
                  <td className="num" style={{ textAlign: 'right' }}>{fmt(r.price)}</td>
                  <td className={`num ${up ? 'up' : 'down'}`} style={{ textAlign: 'right' }}>{up ? '+' : ''}{fmt(r.changePct)}%</td>
                  <td><span className={`pill ${r.signal}`}>{r.signal}</span></td>
                  <td className="num">
                    <span className="scorebar"><i style={{ background: r.score >= 0 ? 'var(--buy)' : 'var(--sell)', width: `${w}%`, left: r.score >= 0 ? '50%' : `${50 - w}%` }} /></span>
                    {r.score > 0 ? '+' : ''}{r.score}
                  </td>
                  <td className="num hide-m">{r.stats.rsi ?? '–'}</td>
                  <td className="num hide-m">{r.levels ? fmt(r.levels.stop) : '–'}</td>
                  <td className="num hide-m">{r.levels ? fmt(r.levels.target1) : '–'}</td>
                  <td><button className="x" title="Remove" onClick={(e) => { e.stopPropagation(); remove(r.symbol); }}>✕</button></td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={9} className="muted" style={{ textAlign: 'center', padding: 28 }}>{loading ? 'Loading signals…' : 'Nothing to show for this filter.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <section className="log card" style={{ padding: 12 }}>
        <h3>Signal changes {log.length > 0 && <button className="x" style={{ fontSize: 12 }} onClick={() => setLog([])}>clear</button>}</h3>
        {log.length === 0 ? (
          <div className="muted">Changes appear here while this page is open, for example WATCH to BUY.</div>
        ) : (
          <ul>
            {log.map((e) => (
              <li key={e.id}>
                <span className="muted num">{new Date(e.t).toLocaleTimeString('en-IN')}</span>
                <b>{displaySymbol(e.symbol)}</b>
                <span className={`pill ${e.from}`}>{e.from}</span>→<span className={`pill ${e.to}`}>{e.to}</span>
                <span className="muted num">@ {fmt(e.price)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="disclaimer">
        Signals come from rule-based technical indicators. Free exchange data can be delayed by up to 15 minutes, so check your broker for the live price before acting. This is a decision aid, not investment advice.
      </p>

      {sel && !isError(sel) && <Detail a={sel} onClose={() => setSelected(null)} />}
    </main>
  );
}
