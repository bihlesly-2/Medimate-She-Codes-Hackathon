import { useQuery } from '@tanstack/react-query';
import { Droplets, Flame, Footprints, Pill } from 'lucide-react';
import { HealthDisclaimer } from '../../components/layout';
import { Card, PageHeader, QueryView, SectionTitle, cx } from '../../components/ui';
import { api } from '../../lib/api';

interface Summary {
  taken: number;
  skipped: number;
  missed: number;
  pending: number;
  total: number;
  rate: number | null;
}
interface ProgressResp {
  medication: {
    streak: number;
    days: { date: string; met: boolean | null }[];
    week: { summary: Summary; formula: string };
    month: { summary: Summary; formula: string };
  };
  steps: { streak: number; goal: number };
  water: { streak: number; goal: number };
  note: string;
}

function SummaryRow({ label, s }: { label: string; s: Summary }) {
  return (
    <div>
      <p className="text-sm font-semibold">{label}</p>
      <div className="mt-2 grid grid-cols-4 gap-2 text-center text-sm">
        {[
          ['Taken', s.taken, 'text-secondary-700'],
          ['Skipped', s.skipped, 'text-muted'],
          ['Not confirmed', s.missed, 'text-danger'],
          ['Not answered yet', s.pending, 'text-primary-700'],
        ].map(([l, n, c]) => (
          <div key={l as string} className="rounded-xl bg-bg p-2">
            <p className={cx('text-xl font-bold', c as string)}>{n}</p>
            <p className="text-[11px] text-muted">{l}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-sm">
        {s.rate === null ? 'No answered reminders yet.' : <>Answered as taken: <strong>{Math.round(s.rate * 100)}%</strong></>}
      </p>
    </div>
  );
}

export default function Progress() {
  const q = useQuery({ queryKey: ['progress'], queryFn: () => api<ProgressResp>('/progress') });
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Streaks & adherence" subtitle="Missing a day happens. What matters is the next one." />
      <QueryView query={q}>
        {(p) => (
          <div className="grid gap-5">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { icon: Pill, label: 'Medicine streak', n: p.medication.streak, unit: 'days all taken' },
                { icon: Footprints, label: 'Steps streak', n: p.steps.streak, unit: `days ≥ ${p.steps.goal.toLocaleString()} steps` },
                { icon: Droplets, label: 'Water streak', n: p.water.streak, unit: `days ≥ ${p.water.goal} ml` },
              ].map((s) => (
                <Card key={s.label} className="p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-muted">
                    <s.icon className="size-4 text-primary-600" aria-hidden /> {s.label}
                  </div>
                  <p className="mt-2 flex items-center gap-2 text-3xl font-extrabold">
                    {s.n} {s.n > 0 ? <Flame className="size-6 text-warning" aria-hidden /> : null}
                  </p>
                  <p className="text-xs text-muted">{s.unit}</p>
                </Card>
              ))}
            </div>
            <Card className="p-5">
              <SectionTitle>Last 30 days of medicine reminders</SectionTitle>
              <ol className="grid grid-cols-10 gap-1.5 sm:grid-cols-15" aria-label="Daily medicine results">
                {p.medication.days.map((d) => (
                  <li
                    key={d.date}
                    title={`${d.date}: ${d.met === null ? 'nothing to answer / in progress' : d.met ? 'all taken' : 'not all taken'}`}
                    className={cx(
                      'grid aspect-square place-items-center rounded-lg text-[10px] font-bold',
                      d.met === null ? 'bg-slate-100 text-slate-400' : d.met ? 'bg-secondary-600 text-white' : 'bg-warning-bg text-warning',
                    )}
                  >
                    <span aria-hidden>{d.met === null ? '·' : d.met ? '✓' : '–'}</span>
                    <span className="sr-only">
                      {d.date}: {d.met === null ? 'no result' : d.met ? 'all taken' : 'not all taken'}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-xs text-muted">✓ all taken · – some skipped or not confirmed · · nothing scheduled or still in progress</p>
            </Card>
            <Card className="grid gap-6 p-5 md:grid-cols-2">
              <SummaryRow label="Last 7 days" s={p.medication.week.summary} />
              <SummaryRow label="Last 30 days" s={p.medication.month.summary} />
              <p className="text-xs text-muted md:col-span-2">How this is calculated: {p.medication.week.formula} {p.note}</p>
            </Card>
          </div>
        )}
      </QueryView>
      <HealthDisclaimer />
    </div>
  );
}
