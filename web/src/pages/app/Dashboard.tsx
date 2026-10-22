import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { WATER_BOTTLE_ML, WATER_GLASS_ML } from '@medimate/shared';
import { CalendarCheck, Check, Crown, Droplets, Flame, Footprints, Lock, MapPin, Pill, Plus, Search, Sparkles, Users } from 'lucide-react';
import { celebrate } from '../../components/celebrate';
import { Button, Input, LinkButton, List, ListRow, Notice, Sheet, Skeleton, StatusBadge, cx, errorMessage, useToast } from '../../components/ui';
import { ApiError, api, post } from '../../lib/api';
import { useMe } from '../../lib/auth';
import { dateOnly, greeting, todayIn } from '../../lib/format';
import type { CareLink, Occurrence, PharmacyPublic, Subscription } from '../../lib/types';

interface ActivitySummary {
  today: string;
  todayTotal: number;
  goal: number;
  streak: number;
}
interface ProgressResp {
  medication: { streak: number };
}

const locked = (e: unknown) => e instanceof ApiError && (e.code === 'PREMIUM_REQUIRED' || e.code === 'CONSENT_REQUIRED');

/** Taken / Skip buttons for one reminder. Shared with the Reminders page. */
export function ReminderActions({ o, compact, onDone }: { o: Occurrence; compact?: boolean; onDone?: (action: 'taken' | 'skipped') => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const m = useMutation({
    mutationFn: (action: 'taken' | 'skipped') => post<{ result: string; status: string }>(`/reminders/${o.id}/confirm`, { action, idempotencyKey: `${o.id}:web` }),
    onSuccess: (r, action) => {
      if (action === 'taken' && r.result !== 'already') celebrate(50);
      toast(r.result === 'already' ? `Already recorded as ${r.status}.` : action === 'taken' ? 'Nice! Recorded as taken.' : 'Recorded as skipped.');
      void qc.invalidateQueries({ queryKey: ['reminders'] });
      void qc.invalidateQueries({ queryKey: ['progress'] });
      onDone?.(action);
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  if (!o.canConfirm) return <StatusBadge status={o.status} />;
  return (
    <div className={cx('grid grid-cols-2 gap-2', compact ? 'w-full sm:w-60' : 'w-full')}>
      <Button variant="outline" onClick={() => m.mutate('skipped')} disabled={m.isPending}>
        Skip
      </Button>
      <Button variant="green" onClick={() => m.mutate('taken')} loading={m.isPending && m.variables === 'taken'}>
        Taken
      </Button>
    </div>
  );
}

type NodeState = 'done' | 'now' | 'later' | 'missed';
interface PathNode {
  key: string;
  icon: typeof Pill;
  title: string;
  sub: string;
  state: NodeState;
  open: () => void;
}

const NODE_STYLE: Record<NodeState, string> = {
  done: 'bg-secondary-600 text-white shadow-[0_6px_0_#0e4f22]',
  now: 'bg-primary-600 text-white shadow-[0_6px_0_#0a2f57]',
  later: 'bg-white text-primary-600 border-2 border-border shadow-[0_6px_0_var(--color-border)]',
  missed: 'bg-[#fff4e0] text-[#b25e00] border-2 border-[#f2d3a0] shadow-[0_6px_0_#f2d3a0]',
};
// Gentle zig-zag like a learning path.
const OFFSETS = ['translate-x-0', 'translate-x-12', 'translate-x-16', 'translate-x-8', '-translate-x-6', '-translate-x-14', '-translate-x-8'];

function DayPath({ nodes }: { nodes: PathNode[] }) {
  return (
    <ol className="relative mx-auto flex max-w-xs flex-col items-center gap-7 py-4" aria-label="Your day">
      {nodes.map((n, i) => (
        <li key={n.key} className={cx('flex flex-col items-center transition-transform', OFFSETS[i % OFFSETS.length])}>
          {n.state === 'now' ? (
            <span className="bob mb-2 rounded-xl border-2 border-border bg-white px-3 py-1 font-brand text-sm font-extrabold text-primary-700 shadow-[0_3px_0_var(--color-border)]">Now</span>
          ) : null}
          <button
            type="button"
            onClick={n.open}
            className={cx(
              'relative grid size-[76px] place-items-center rounded-full transition-transform active:translate-y-[5px] active:shadow-none',
              NODE_STYLE[n.state],
              n.state === 'now' && 'pulse-ring',
            )}
            aria-label={`${n.title}, ${n.sub}`}
          >
            {n.state === 'done' ? <Check className="size-9" strokeWidth={3} aria-hidden /> : <n.icon className="size-8" aria-hidden />}
          </button>
          <span className="mt-2 max-w-[11rem] text-center">
            <span className="block font-brand text-[15px] font-extrabold leading-tight text-ink">{n.title}</span>
            <span className="block text-xs font-semibold text-muted">{n.sub}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function Dashboard() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const tz = me?.timezone ?? 'Africa/Douala';
  const reminders = useQuery({ queryKey: ['reminders', 'today'], queryFn: () => api<{ items: Occurrence[] }>('/reminders?range=today'), retry: false });
  const water = useQuery({ queryKey: ['water'], queryFn: () => api<ActivitySummary>('/water'), retry: false });
  const steps = useQuery({ queryKey: ['steps'], queryFn: () => api<ActivitySummary>('/steps'), retry: false });
  const progress = useQuery({ queryKey: ['progress'], queryFn: () => api<ProgressResp>('/progress'), retry: false });
  const checkups = useQuery({ queryKey: ['checkups'], queryFn: () => api<{ items: { id: string; title: string; dueAt: string; status: string }[] }>('/checkups'), retry: false });
  const sub = useQuery({ queryKey: ['subscription'], queryFn: () => api<Subscription>('/me/subscription') });
  const invites = useQuery({ queryKey: ['care', 'invites'], queryFn: () => api<{ items: CareLink[] }>('/caretaker/invites') });
  const nearby = useQuery({
    queryKey: ['pharmacies', me?.area ?? ''],
    queryFn: async () => {
      const local = await api<{ items: PharmacyPublic[] }>(`/pharmacies?area=${encodeURIComponent(me?.area ?? '')}`);
      return local.items.length ? local : api<{ items: PharmacyPublic[] }>('/pharmacies');
    },
  });

  const [sheet, setSheet] = useState<{ kind: 'med'; o: Occurrence } | { kind: 'water' } | { kind: 'steps' } | null>(null);
  const [stepsInput, setStepsInput] = useState('');

  const addWater = useMutation({
    mutationFn: (ml: number) => post('/water', { amountMl: ml }),
    onSuccess: async (_r, ml) => {
      const before = water.data?.todayTotal ?? 0;
      const goal = water.data?.goal ?? 2000;
      await qc.invalidateQueries({ queryKey: ['water'] });
      if (before < goal && before + ml >= goal) {
        celebrate();
        toast('Water goal reached. Well done!');
      } else toast(`Added ${ml} ml.`);
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const addSteps = useMutation({
    mutationFn: (n: number) => post('/steps', { date: todayIn(tz), steps: n }),
    onSuccess: async (_r, n) => {
      const before = steps.data?.todayTotal ?? 0;
      const goal = steps.data?.goal ?? 6000;
      await qc.invalidateQueries({ queryKey: ['steps'] });
      setStepsInput('');
      setSheet(null);
      if (before < goal && before + n >= goal) {
        celebrate();
        toast('Steps goal reached!');
      } else toast(`Added ${n.toLocaleString()} steps.`);
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const meds = (reminders.data?.items ?? []).filter((o) => o.kind === 'medication');
  const now = Date.now();
  const nextIdx = meds.findIndex((o) => o.status === 'sent' || (o.status === 'scheduled' && new Date(o.scheduledFor).getTime() > now));
  const nodes: PathNode[] = meds.map((o, i) => {
    const state: NodeState =
      o.status === 'taken' ? 'done' : o.status === 'missed' || o.status === 'skipped' ? 'missed' : i === nextIdx ? 'now' : 'later';
    return {
      key: o.id,
      icon: Pill,
      title: o.plan?.medicineName ?? 'Medicine',
      sub: `${o.localTime} · ${o.status === 'taken' ? 'Taken' : o.status === 'skipped' ? 'Skipped' : o.status === 'missed' ? 'Not confirmed' : o.status === 'sent' ? 'Due now' : 'Later'}`,
      state,
      open: () => setSheet({ kind: 'med', o }),
    };
  });
  if (water.data) {
    const done = water.data.todayTotal >= water.data.goal;
    nodes.push({ key: 'water', icon: Droplets, title: 'Water', sub: `${(water.data.todayTotal / 1000).toFixed(1)} of ${(water.data.goal / 1000).toFixed(1)} L`, state: done ? 'done' : nextIdx === -1 ? 'now' : 'later', open: () => setSheet({ kind: 'water' }) });
  }
  if (steps.data) {
    const done = steps.data.todayTotal >= steps.data.goal;
    nodes.push({ key: 'steps', icon: Footprints, title: 'Steps', sub: `${steps.data.todayTotal.toLocaleString()} of ${steps.data.goal.toLocaleString()}`, state: done ? 'done' : 'later', open: () => setSheet({ kind: 'steps' }) });
  }
  const doneCount = nodes.filter((n) => n.state === 'done').length;
  const streak = progress.data?.medication.streak ?? 0;
  const upcomingCheckup = checkups.data?.items.find((c) => c.status === 'upcoming' && new Date(c.dueAt).getTime() > now);
  const firstName = me?.displayName?.split(' ')[0] ?? 'there';
  const isLocked = locked(reminders.error);

  return (
    <div className="mx-auto max-w-xl">
      {/* Top bar: greeting, streak, day progress */}
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-muted">{new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p>
          <h1 className="truncate text-[26px] leading-tight">
            {greeting(tz)}, {firstName}
          </h1>
        </div>
        <Link to="/app/progress" className="inline-flex shrink-0 items-center gap-1 rounded-2xl border-2 border-b-4 border-[#f2d3a0] bg-[#fff4e0] px-3 py-1.5 font-brand text-lg font-extrabold text-[#b25e00]" aria-label={`${streak} day medicine streak`}>
          <Flame className={cx('size-5', streak > 0 && 'fill-[#ff9600] text-[#ff9600]')} aria-hidden /> {streak}
        </Link>
      </header>

      {nodes.length ? (
        <div className="card-3d mt-4 rounded-2xl bg-white p-4">
          <div className="flex items-center justify-between font-brand font-extrabold">
            <span className="text-ink">Today’s goals</span>
            <span className="text-secondary-600">
              {doneCount} of {nodes.length}
            </span>
          </div>
          <div className="mt-2 h-4 overflow-hidden rounded-full bg-slate-200" aria-hidden>
            <div className="h-full rounded-full bg-secondary-400 transition-[width] duration-700" style={{ width: `${(doneCount / Math.max(1, nodes.length)) * 100}%` }} />
          </div>
        </div>
      ) : null}

      {sub.data?.tier === 'free' || isLocked ? (
        <div className="mt-4">
          <Notice tone="warning" icon={Crown} title={(reminders.error as ApiError | null)?.code === 'CONSENT_REQUIRED' ? 'Allow your health log first' : 'Your free month has ended'}>
            {(reminders.error as ApiError | null)?.code === 'CONSENT_REQUIRED' ? (
              <>
                MEDIMATE needs your permission to keep reminders and logs. <Link to="/app/settings#consent" className="font-bold underline">Review permissions</Link>
              </>
            ) : (
              <>
                Finding pharmacies and prices stays free. <Link to="/app/billing" className="font-bold underline">Get Premium</Link> to bring back reminders, water and steps.
              </>
            )}
          </Notice>
        </div>
      ) : null}

      {invites.data?.items.length ? (
        <div className="mt-4">
          <Notice title="Someone asked you to be their caretaker" icon={Users}>
            {invites.data.items[0]!.person?.displayName} would like your help. <Link to="/care" className="font-bold underline">Review the invitation</Link>
          </Notice>
        </div>
      ) : null}

      {/* The path */}
      <section className="mt-2" aria-labelledby="day-h">
        <h2 id="day-h" className="sr-only">
          Your day
        </h2>
        {reminders.isPending || water.isPending ? (
          <div className="mx-auto mt-6 grid max-w-xs justify-items-center gap-8">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="size-[76px] rounded-full" />
            ))}
          </div>
        ) : nodes.length ? (
          <DayPath nodes={nodes} />
        ) : !isLocked ? (
          <div className="card-3d mt-6 rounded-2xl bg-white p-6 text-center">
            <Sparkles className="bob mx-auto size-10 text-primary-600" aria-hidden />
            <p className="mt-3 font-brand text-xl font-extrabold">Let’s plan your day</p>
            <p className="mt-1 text-sm text-muted">Add a medicine from your prescription and it will show up here at the right times.</p>
            <LinkButton to="/app/medicines/new" variant="green" icon={Plus} className="mt-5 w-full">
              Add a medicine
            </LinkButton>
          </div>
        ) : (
          <div className="mt-6 grid justify-items-center gap-2 text-muted">
            <Lock className="size-8" aria-hidden />
          </div>
        )}
        {meds.length ? (
          <div className="mt-2 flex justify-center">
            <LinkButton to="/app/medicines/new" variant="outline" size="sm" icon={Plus}>
              Add a medicine
            </LinkButton>
          </div>
        ) : null}
      </section>

      {/* Coming up and nearby */}
      <section className="mt-8" aria-labelledby="more-h">
        <h2 id="more-h" className="mb-2 text-lg">
          Coming up
        </h2>
        <List label="Coming up">
          <ListRow to="/app/checkups" icon={CalendarCheck} tone="green" title="Next checkup" detail={upcomingCheckup ? `${upcomingCheckup.title}, ${dateOnly(upcomingCheckup.dueAt, tz)}` : 'None planned. Add one'} />
          <ListRow to="/app/care" icon={Users} title="Caretakers" detail="Choose who can help and what they see" />
        </List>
      </section>

      <section className="mt-8" aria-labelledby="near-h">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 id="near-h" className="text-lg">
            Pharmacies{me?.area ? ` near ${me.area}` : ''}
          </h2>
          <Link to="/find" className="inline-flex items-center gap-1 text-sm font-bold text-primary-700">
            <Search className="size-4" aria-hidden /> Search
          </Link>
        </div>
        {nearby.isPending ? (
          <Skeleton className="h-40" />
        ) : (
          <List label="Nearby pharmacies">
            {(nearby.data?.items ?? []).slice(0, 4).map((p) => (
              <ListRow key={p.id} to={`/pharmacies/${p.id}`} icon={MapPin} title={p.name} detail={`${p.area} · ${p.openNow === null ? 'hours not listed' : p.openNow ? 'open now' : 'closed now'}`} />
            ))}
          </List>
        )}
      </section>

      <p className="mt-8 text-center text-xs text-muted">MEDIMATE does not diagnose or replace a health worker.</p>

      {/* Quick-action sheets */}
      <Sheet open={sheet?.kind === 'med'} onClose={() => setSheet(null)} title={sheet?.kind === 'med' ? (sheet.o.plan?.medicineName ?? 'Medicine') : ''}>
        {sheet?.kind === 'med' ? (
          <div className="grid gap-4">
            <div className="rounded-2xl bg-sky p-4">
              <p className="font-brand text-2xl font-extrabold text-primary-700">{sheet.o.localTime}</p>
              <p className="mt-1 text-[15px] text-ink">{sheet.o.plan?.doseText}</p>
              <p className="mt-1 text-xs text-muted">As written on your prescription · SMS code {sheet.o.ref}</p>
            </div>
            {sheet.o.canConfirm ? (
              <ReminderActions o={sheet.o} onDone={() => setSheet(null)} />
            ) : (
              <p className="text-sm text-muted">{sheet.o.status === 'scheduled' ? 'You can answer this when it is time. We will remind you.' : 'Already answered.'}</p>
            )}
          </div>
        ) : null}
      </Sheet>

      <Sheet open={sheet?.kind === 'water'} onClose={() => setSheet(null)} title="Add water">
        {water.data ? (
          <div className="grid gap-4">
            <p className="text-sm text-muted">
              {water.data.todayTotal} of {water.data.goal} ml today. Needs vary from person to person.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                [WATER_GLASS_ML, 'Glass'],
                [WATER_BOTTLE_ML, 'Bottle'],
                [1000, '1 litre'],
              ].map(([ml, label]) => (
                <Button key={label} variant="outline" className="!min-h-20 flex-col !gap-0" disabled={addWater.isPending} onClick={() => addWater.mutate(Number(ml))}>
                  <Droplets className="size-6 text-primary-500" aria-hidden />
                  {label}
                  <span className="text-xs font-semibold text-muted">{ml} ml</span>
                </Button>
              ))}
            </div>
          </div>
        ) : null}
      </Sheet>

      <Sheet open={sheet?.kind === 'steps'} onClose={() => setSheet(null)} title="Add steps">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(stepsInput);
            if (n > 0) addSteps.mutate(n);
          }}
        >
          <p className="text-sm text-muted">From your phone’s step counter, a watch, or your own estimate.</p>
          <Input type="number" inputMode="numeric" min={1} max={100000} aria-label="Steps" value={stepsInput} onChange={(e) => setStepsInput(e.target.value)} placeholder="e.g. 2500" className="min-h-14 text-lg" />
          <div className="flex flex-wrap gap-2">
            {[1000, 2500, 5000].map((n) => (
              <button key={n} type="button" onClick={() => setStepsInput(String(n))} className="min-h-10 rounded-xl border-2 border-b-4 border-border bg-white px-3 text-sm font-bold">
                +{n.toLocaleString()}
              </button>
            ))}
          </div>
          <Button type="submit" variant="green" size="lg" loading={addSteps.isPending} disabled={!(Number(stepsInput) > 0)}>
            Add steps
          </Button>
        </form>
      </Sheet>
    </div>
  );
}
