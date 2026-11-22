import type { Analysis } from '@/lib/types';

const W = 520;
const H = 210;
const PAD = { l: 8, r: 54, t: 10, b: 10 };

function path(values: (number | null)[], x: (i: number) => number, y: (v: number) => number) {
  let d = '';
  let pen = false;
  values.forEach((v, i) => {
    if (v === null) { pen = false; return; }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  });
  return d;
}

export default function Chart({ a }: { a: Analysis }) {
  const { c, sma20, sma50 } = a.series;
  const lv = a.levels;
  const all: number[] = [...c];
  for (const s of [sma20, sma50]) for (const v of s) if (v !== null) all.push(v);
  if (lv) all.push(lv.stop, lv.target1);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const x = (i: number) => PAD.l + (i / (c.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / span) * (H - PAD.t - PAD.b);

  const line = (v: number, color: string, label: string) => (
    <g key={label}>
      <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke={color} strokeDasharray="4 4" strokeWidth={1} opacity={0.8} />
      <text x={W - PAD.r + 4} y={y(v) + 3} fontSize={10} fill={color}>{label}</text>
    </g>
  );

  const up = c[c.length - 1] >= c[0];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${a.symbol} price chart`}>
      <path d={path(c, x, y)} fill="none" stroke={up ? '#22c55e' : '#ef4444'} strokeWidth={1.8} />
      <path d={path(sma20, x, y)} fill="none" stroke="#6aa3ff" strokeWidth={1} opacity={0.9} />
      <path d={path(sma50, x, y)} fill="none" stroke="#f59e0b" strokeWidth={1} opacity={0.9} />
      {lv && line(lv.stop, '#ef4444', 'Stop')}
      {lv && line(lv.target1, '#22c55e', 'T1')}
      {lv && line(lv.target2, '#22c55e', 'T2')}
      <text x={PAD.l + 2} y={H - 1} fontSize={10} fill="#8a97b1">Line: price · blue: 20 avg · amber: 50 avg</text>
    </svg>
  );
}
