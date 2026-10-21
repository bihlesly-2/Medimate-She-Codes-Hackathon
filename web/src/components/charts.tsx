import { useId, useState } from 'react';
import { cx } from './ui';

/**
 * Small, dependency-free SVG charts. Each chart has a text summary for screen readers and a
 * "show as table" toggle, and never adds clinical bands or colours that imply normal/abnormal.
 */
export interface Point {
  label: string;
  value: number;
  value2?: number | null;
}

export function LineChart({ points, unit, title, height = 160 }: { points: Point[]; unit: string; title: string; height?: number }) {
  const [table, setTable] = useState(false);
  const id = useId();
  if (points.length === 0) return <p className="text-sm text-muted">No data yet.</p>;
  const all = points.flatMap((p) => [p.value, p.value2 ?? p.value]);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const pad = (max - min || 1) * 0.15;
  const lo = min - pad;
  const hi = max + pad;
  const W = 600;
  const x = (i: number) => (points.length === 1 ? W / 2 : 24 + (i * (W - 48)) / (points.length - 1));
  const y = (v: number) => 12 + (1 - (v - lo) / (hi - lo)) * (height - 36);
  const path = (key: 'value' | 'value2') =>
    points
      .map((p, i) => [x(i), y((key === 'value' ? p.value : p.value2) ?? p.value)] as const)
      .map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`)
      .join(' ');
  const hasSecond = points.some((p) => p.value2 != null);
  const last = points.at(-1)!;
  return (
    <figure aria-labelledby={`${id}-cap`}>
      <figcaption id={`${id}-cap`} className="sr-only">
        {title}: {points.length} entries from {points[0]!.label} to {last.label}. Latest {last.value}
        {last.value2 != null ? `/${last.value2}` : ''} {unit}.
      </figcaption>
      {table ? (
        <div className="max-h-56 overflow-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Value ({unit})</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-3 py-1.5">{p.label}</td>
                  <td className="px-3 py-1.5 font-semibold">
                    {p.value}
                    {p.value2 != null ? `/${p.value2}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full" role="img" aria-hidden>
          {[0, 0.5, 1].map((f) => (
            <line key={f} x1="24" x2={W - 24} y1={12 + f * (height - 36)} y2={12 + f * (height - 36)} stroke="#E5E9EF" strokeDasharray="4 4" />
          ))}
          <path d={path('value')} fill="none" stroke="var(--color-primary-600)" strokeWidth="2.5" strokeLinejoin="round" />
          {hasSecond ? <path d={path('value2')} fill="none" stroke="var(--color-secondary-teal)" strokeWidth="2.5" strokeDasharray="6 4" /> : null}
          {points.map((p, i) => (
            <circle key={i} cx={x(i)} cy={y(p.value)} r="3.5" fill="#fff" stroke="var(--color-primary-600)" strokeWidth="2" />
          ))}
          <text x="24" y={height - 4} fontSize="11" fill="#5B6470">
            {points[0]!.label}
          </text>
          <text x={W - 24} y={height - 4} fontSize="11" fill="#5B6470" textAnchor="end">
            {last.label}
          </text>
        </svg>
      )}
      <button type="button" onClick={() => setTable((v) => !v)} className="mt-1 text-xs font-semibold text-primary-700 hover:underline">
        {table ? 'Show as chart' : 'Show as table'}
      </button>
    </figure>
  );
}

export function BarChart({ points, goal, unit, title }: { points: Point[]; goal?: number; unit: string; title: string }) {
  const max = Math.max(goal ?? 0, ...points.map((p) => p.value), 1);
  return (
    <figure>
      <figcaption className="sr-only">
        {title}. {points.map((p) => `${p.label}: ${p.value} ${unit}`).join('; ')}.
      </figcaption>
      <div className="flex h-36 items-end gap-1.5" aria-hidden>
        {points.map((p, i) => {
          const met = goal !== undefined && p.value >= goal;
          return (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div className="relative flex w-full flex-1 items-end">
                <div
                  className={cx('w-full rounded-t-md transition-all', met ? 'bg-secondary-600' : 'bg-primary-400/80')}
                  style={{ height: `${Math.max(2, (p.value / max) * 100)}%` }}
                  title={`${p.label}: ${p.value} ${unit}`}
                />
              </div>
              <span className="text-[10px] text-muted">{p.label}</span>
            </div>
          );
        })}
      </div>
      {goal !== undefined ? <p className="mt-2 text-xs text-muted">Darker green bars reached your goal of {goal.toLocaleString()} {unit}.</p> : null}
    </figure>
  );
}

export function ProgressRing({ value, goal, label, sub }: { value: number; goal: number; label: string; sub: string }) {
  const pct = Math.min(1, goal ? value / goal : 0);
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="size-28 -rotate-90" role="img" aria-label={`${label}: ${value} of ${goal}`}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="#E8F3FD" strokeWidth="10" />
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-primary-600)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${pct * c} ${c}`} />
      </svg>
      <div>
        <p className="text-3xl font-bold text-ink">{value.toLocaleString()}</p>
        <p className="text-sm text-muted">{sub}</p>
      </div>
    </div>
  );
}
