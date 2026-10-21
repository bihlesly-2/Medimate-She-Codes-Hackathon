import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { WATER_BOTTLE_ML, WATER_GLASS_ML } from '@medimate/shared';
import { CupSoda, Flame, GlassWater, Milk, Plus, Target, Trash2 } from 'lucide-react';
import { BarChart, ProgressRing } from '../../components/charts';
import { HealthDisclaimer } from '../../components/layout';
import { Button, Card, Field, Input, Notice, PageHeader, QueryView, SectionTitle, errorMessage, useToast } from '../../components/ui';
import { api, del, patch, post } from '../../lib/api';
import { useMe } from '../../lib/auth';
import { todayIn } from '../../lib/format';

interface Summary {
  today: string;
  todayTotal: number;
  goal: number;
  daily: { date: string; total: number }[];
  streak: number;
  todayEntries: { id: string; amountMl?: number; steps?: number; loggedAt?: string; createdAt?: string; source: string }[];
}

function GoalEditor({ kind, goal }: { kind: 'steps' | 'water'; goal: number }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState(String(goal));
  const m = useMutation({
    mutationFn: () => patch('/me/profile', kind === 'steps' ? { stepGoal: Number(v) } : { waterTargetMl: Number(v) }),
    onSuccess: () => {
      toast('Goal updated.');
      void qc.invalidateQueries({ queryKey: [kind] });
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <Field label={kind === 'steps' ? 'Daily step goal' : 'Daily water target (ml)'}>
        {(id) => <Input id={id} type="number" min={kind === 'steps' ? 100 : 250} max={kind === 'steps' ? 100000 : 10000} value={v} onChange={(e) => setV(e.target.value)} className="w-36" />}
      </Field>
      <Button type="submit" variant="outline" icon={Target} loading={m.isPending}>
        Set
      </Button>
    </form>
  );
}

const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'narrow', timeZone: 'UTC' });

export function StepsPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['steps'], queryFn: () => api<Summary>('/steps') });
  const [steps, setSteps] = useState('');
  const [date, setDate] = useState(todayIn(me?.timezone ?? 'Africa/Douala'));
  const add = useMutation({
    mutationFn: () => post('/steps', { date, steps: Number(steps) }),
    onSuccess: () => {
      toast('Steps added.');
      setSteps('');
      void qc.invalidateQueries({ queryKey: ['steps'] });
    },
  });
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Steps & activity" subtitle="Log steps from your phone, a step counter or your own estimate. Basic phones can send STEPS 4500 by SMS." />
      <QueryView query={q}>
        {(d) => (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <Card className="p-5">
              <ProgressRing value={d.todayTotal} goal={d.goal} label="Steps today" sub={`of your ${d.goal.toLocaleString()} step goal today`} />
              <p className="mt-3 flex items-center gap-2 text-sm">
                <Flame className="size-4 text-warning" aria-hidden />
                {d.streak > 0 ? `${d.streak} days in a row at your goal.` : 'Every step counts. Your streak starts on any day you reach your goal.'}
              </p>
              <div className="mt-5">
                <SectionTitle>Last 14 days</SectionTitle>
                <BarChart title="Steps per day" unit="steps" goal={d.goal} points={d.daily.map((x) => ({ label: dayLabel(x.date), value: x.total }))} />
              </div>
            </Card>
            <div className="grid h-fit gap-4">
              <Card className="p-5">
                <SectionTitle>Add steps</SectionTitle>
                <form
                  className="grid gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    add.mutate();
                  }}
                >
                  <Field label="Steps">{(id) => <Input id={id} type="number" min={0} max={100000} required value={steps} onChange={(e) => setSteps(e.target.value)} />}</Field>
                  <Field label="Day">{(id) => <Input id={id} type="date" max={todayIn(me?.timezone ?? 'Africa/Douala')} value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
                  {add.isError ? <Notice tone="danger">{errorMessage(add.error)}</Notice> : null}
                  <Button type="submit" icon={Plus} loading={add.isPending}>
                    Add
                  </Button>
                </form>
              </Card>
              <Card className="p-5">
                <GoalEditor kind="steps" goal={d.goal} />
              </Card>
            </div>
          </div>
        )}
      </QueryView>
      <HealthDisclaimer />
    </div>
  );
}

export function WaterPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['water'], queryFn: () => api<Summary>('/water') });
  const [custom, setCustom] = useState('');
  const add = useMutation({
    mutationFn: (ml: number) => post('/water', { amountMl: ml }),
    onSuccess: (_r, ml) => {
      toast(`Added ${ml} ml.`);
      void qc.invalidateQueries({ queryKey: ['water'] });
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/water/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['water'] }),
  });
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Water" subtitle="Hydration needs vary from person to person and with weather, activity and health conditions. Set a target that suits you, or ask a health worker." />
      <QueryView query={q}>
        {(d) => (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <Card className="p-5">
              <ProgressRing value={d.todayTotal} goal={d.goal} label="Water today" sub={`ml of your ${d.goal} ml target`} />
              <div className="mt-5 grid grid-cols-3 gap-2">
                {[
                  { ml: WATER_GLASS_ML, label: 'Glass', icon: GlassWater },
                  { ml: WATER_BOTTLE_ML, label: 'Bottle', icon: Milk },
                  { ml: 1000, label: '1 litre', icon: CupSoda },
                ].map((b) => (
                  <Button key={b.ml} variant="outline" className="!h-auto flex-col py-3" onClick={() => add.mutate(b.ml)} disabled={add.isPending}>
                    <b.icon className="size-6 text-primary-600" aria-hidden />
                    <span>{b.label}</span>
                    <span className="text-xs font-normal text-muted">{b.ml} ml</span>
                  </Button>
                ))}
              </div>
              <form
                className="mt-3 flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (Number(custom) > 0) add.mutate(Number(custom));
                  setCustom('');
                }}
              >
                <Field label="Other amount (ml)">{(id) => <Input id={id} type="number" min={10} max={5000} value={custom} onChange={(e) => setCustom(e.target.value)} className="w-32" />}</Field>
                <Button type="submit" variant="outline" icon={Plus}>
                  Add
                </Button>
              </form>
              <div className="mt-6">
                <SectionTitle>Last 14 days</SectionTitle>
                <BarChart title="Water per day" unit="ml" goal={d.goal} points={d.daily.map((x) => ({ label: dayLabel(x.date), value: x.total }))} />
              </div>
            </Card>
            <div className="grid h-fit gap-4">
              <Card className="p-5">
                <SectionTitle>Today</SectionTitle>
                {d.todayEntries.length === 0 ? (
                  <p className="text-sm text-muted">Nothing logged yet today.</p>
                ) : (
                  <ul className="divide-y divide-border text-sm">
                    {d.todayEntries.map((e) => (
                      <li key={e.id} className="flex items-center justify-between py-1.5">
                        <span>
                          {e.amountMl} ml · {e.loggedAt ? new Date(e.loggedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''} · {e.source}
                        </span>
                        <Button variant="ghost" size="sm" icon={Trash2} aria-label="Remove entry" onClick={() => remove.mutate(e.id)} />
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-sm">{d.streak > 0 ? `${d.streak}-day streak of reaching your target.` : 'Reach your target on any day to start a streak.'}</p>
              </Card>
              <Card className="p-5">
                <GoalEditor kind="water" goal={d.goal} />
              </Card>
            </div>
          </div>
        )}
      </QueryView>
      <HealthDisclaimer />
    </div>
  );
}
