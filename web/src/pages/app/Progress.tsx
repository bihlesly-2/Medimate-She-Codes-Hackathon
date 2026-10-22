import { useQuery } from '@tanstack/react-query';
import { Droplets, Footprints, Pill } from 'lucide-react';
import { HealthDisclaimer } from '../../components/layout';
import { Card, List, ListItem, ListRow, PageHeader, QueryView, SectionTitle, cx } from '../../components/ui';
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

const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

function PeriodList({ label, s }: { label: string; s: Summary }) {
  const rows: [string, number][] = [
    ['Taken', s.taken],
    ['Skipped', s.skipped],
    ['Not confirmed', s.missed],
    ['Not answered yet', s.pending],
  ];
  return (
    <section aria-label={label}>
      <h3 className="mb-2 text-sm font-bold text-muted">{label}</h3>
      <List>
        {rows.map(([l, n]) => (
          <ListItem key={l} className="flex justify-between gap-3 !py-2.5 text-sm">
            <span>{l}</span>
            <span className="font-bold">{n}</span>
          </ListItem>
        ))}
        <ListItem className="flex justify-between gap-3 !py-2.5 text-sm">
          <span>Answered as taken</span>
          <span className="font-bold">{s.rate === null ? 'No answers yet' : `${Math.round(s.rate * 100)}%`}</span>
        </ListItem>
      </List>
    </section>
  );
}

export default function Progress() {
  const q = useQuery({ queryKey: ['progress'], queryFn: () => api<ProgressResp>('/progress') });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Streaks and adherence" subtitle="Missing a day happens. What matters is the next one." />
      <QueryView query={q}>
        {(p) => (
          <div className="grid gap-6">
            <section aria-labelledby="streaks-h">
              <SectionTitle>
                <span id="streaks-h">Streaks</span>
              </SectionTitle>
              <List label="Streaks">
                <ListRow icon={Pill} title="Medicines" detail="Days in a row with every reminder answered as taken" right={<span className="text-xl font-bold">{days(p.medication.streak)}</span>} />
                <ListRow icon={Footprints} title="Steps" detail={`Days in a row with at least ${p.steps.goal.toLocaleString()} steps`} right={<span className="text-xl font-bold">{days(p.steps.streak)}</span>} />
                <ListRow icon={Droplets} title="Water" detail={`Days in a row with at least ${p.water.goal} ml`} right={<span className="text-xl font-bold">{days(p.water.streak)}</span>} />
              </List>
            </section>

            <section aria-labelledby="month-h">
              <SectionTitle>
                <span id="month-h">Last 30 days of medicine reminders</span>
              </SectionTitle>
              <Card className="p-4">
                <ol className="grid grid-cols-10 gap-1.5" aria-label="Daily medicine results">
                  {p.medication.days.map((d) => (
                    <li
                      key={d.date}
                      title={`${d.date}: ${d.met === null ? 'nothing to answer or still in progress' : d.met ? 'all taken' : 'not all taken'}`}
                      className={cx(
                        'grid aspect-square place-items-center rounded-md text-[11px] font-bold',
                        d.met === null ? 'bg-slate-100 text-slate-400' : d.met ? 'bg-secondary-600 text-white' : 'bg-warning-bg text-warning',
                      )}
                    >
                      <span aria-hidden>{d.met === null ? '·' : d.met ? '✓' : '!'}</span>
                      <span className="sr-only">
                        {d.date}: {d.met === null ? 'no result' : d.met ? 'all taken' : 'not all taken'}
                      </span>
                    </li>
                  ))}
                </ol>
                <ul className="mt-3 grid gap-1 text-xs text-muted sm:flex sm:gap-4">
                  <li>✓ all taken</li>
                  <li>! some skipped or not confirmed</li>
                  <li>· nothing scheduled or still in progress</li>
                </ul>
              </Card>
            </section>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <PeriodList label="Last 7 days" s={p.medication.week.summary} />
              <PeriodList label="Last 30 days" s={p.medication.month.summary} />
            </div>
            <p className="text-xs text-muted">
              How this is calculated: {p.medication.week.formula} {p.note}
            </p>
          </div>
        )}
      </QueryView>
      <HealthDisclaimer />
    </div>
  );
}
