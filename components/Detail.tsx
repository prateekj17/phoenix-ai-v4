'use client';

import { useEffect } from 'react';
import Chart from './Chart';
import { displaySymbol } from '@/lib/market';
import type { Analysis } from '@/lib/types';

const fmt = (x: number | null | undefined, d = 2) =>
  x === null || x === undefined ? '–' : x.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });

export default function Detail({ a, onClose }: { a: Analysis; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const s = a.stats;
  const up = a.change >= 0;

  return (
    <div className="overlay" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="head">
          <div>
            <h2>{displaySymbol(a.symbol)}</h2>
            <div className="muted">{a.name}</div>
          </div>
          <button className="btn" onClick={onClose}>Close</button>
        </div>

        <div className="big num">
          {fmt(a.price)} <span className={`${up ? 'up' : 'down'}`} style={{ fontSize: 15 }}>{up ? '+' : ''}{fmt(a.change)} ({up ? '+' : ''}{fmt(a.changePct)}%)</span>
        </div>

        <div style={{ margin: '12px 0', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={`pill ${a.signal}`}>{a.signal}</span>
          <span className="muted">Score <b className="num" style={{ color: 'var(--text)' }}>{a.score > 0 ? '+' : ''}{a.score}</b> · Confidence <b className="num" style={{ color: 'var(--text)' }}>{a.confidence}%</b></span>
        </div>

        <Chart a={a} />

        {a.levels && (
          <>
            <h4>Risk plan ({a.score >= 0 ? 'long' : 'exit / avoid'})</h4>
            <div className="grid">
              <div className="kv"><span>Stop / invalidation</span><b className="num down">{fmt(a.levels.stop)}</b></div>
              <div className="kv"><span>Target 1 (1.5R)</span><b className="num up">{fmt(a.levels.target1)}</b></div>
              <div className="kv"><span>Target 2 (3R)</span><b className="num up">{fmt(a.levels.target2)}</b></div>
            </div>
            <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
              Risk per share is {fmt(a.levels.riskPct)}% of price (1.5 x ATR). Size positions so a stop-out costs you an amount you accept.
            </div>
          </>
        )}

        {(a.reasons.length > 0 || a.triggers.length > 0) && (
          <>
            <h4>Why {a.signal}</h4>
            <ul className="tidy">
              {a.reasons.map((r) => <li key={r}>{r}</li>)}
              {a.triggers.map((r) => <li key={r} style={{ color: 'var(--watch)' }}>{r}</li>)}
            </ul>
          </>
        )}

        <h4>Factor breakdown</h4>
        {a.factors.map((f) => {
          const pct = Math.min(50, (Math.abs(f.score) / f.max) * 50);
          return (
            <div className="factor" key={f.name}>
              <span>{f.name}</span>
              <div className="fbar">
                <i style={{ background: f.score >= 0 ? 'var(--buy)' : 'var(--sell)', width: `${pct}%`, left: f.score >= 0 ? '50%' : `${50 - pct}%` }} />
              </div>
              <small>{f.note}</small>
            </div>
          );
        })}

        <h4>Key numbers</h4>
        <div className="grid">
          <div className="kv"><span>RSI (14)</span><b className="num">{fmt(s.rsi, 1)}</b></div>
          <div className="kv"><span>ADX</span><b className="num">{fmt(s.adx, 1)}</b></div>
          <div className="kv"><span>ATR %</span><b className="num">{fmt(s.atrPct)}%</b></div>
          <div className="kv"><span>SMA 20</span><b className="num">{fmt(s.sma20)}</b></div>
          <div className="kv"><span>SMA 50</span><b className="num">{fmt(s.sma50)}</b></div>
          <div className="kv"><span>SMA 200</span><b className="num">{fmt(s.sma200)}</b></div>
          <div className="kv"><span>52w high</span><b className="num">{fmt(s.high52)}</b></div>
          <div className="kv"><span>52w low</span><b className="num">{fmt(s.low52)}</b></div>
          <div className="kv"><span>Volume vs avg</span><b className="num">{s.volRatio === null ? '–' : `${fmt(s.volRatio)}x`}</b></div>
        </div>

        <div className="disclaimer">Data as of {new Date(a.asOf * 1000).toLocaleString('en-IN')}. Signals are rule-based indicators, not investment advice.</div>
      </aside>
    </div>
  );
}
