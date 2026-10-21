import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CalendarCheck, Crown, Droplets, Footprints, MapPin, MessageSquare, Pill, Users } from 'lucide-react';
import { EcgLine } from '../../components/brand';
import { HealthDisclaimer } from '../../components/layout';
import { Badge, Button, LinkButton, List, ListRow, Notice, Skeleton, StatusBadge, cx, errorMessage, useToast } from '../../components/ui';
import { ApiError, api, post } from '../../lib/api';
import { useMe } from '../../lib/auth';
import { dateOnly, greeting } from '../../lib/format';
import type { CareLink, Occurrence, PharmacyPublic, Subscription } from '../../lib/types';

interface ActivitySummary {
  today: string;
  todayTotal: number;
  goal: number;
  streak: number;
}

const locked = (e: unknown) => e instanceof ApiError && (e.code === 'PREMIUM_REQUIRED' || e.code === 'CONSENT_REQUIRED');

export function ReminderActions({ o, compact }: { o: Occurrence; compact?: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [ripple, setRipple] = useState(false);
  const m = useMutation({
    mutationFn: (action: 'taken' | 'skipped') => post<{ result: string; status: string }>(`/reminders/${o.id}/confirm`, { action, idempotencyKey: `${o.id}:web` }),
    onSuccess: (r, action) => {
      setRipple(true);
      setTimeout(() => setRipple(false), 1900);
      toast(r.result === 'already' ? `Already recorded as ${r.status}.` : action === 'taken' ? 'Recorded as taken.' : 'Recorded as skipped.');
      void qc.invalidateQueries({ queryKey: ['reminders'] });
      void qc.invalidateQueries({ queryKey: ['progress'] });
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  if (!o.canConfirm) return <StatusBadge status={o.status} />;
  return (
    <div className={cx('grid grid-cols-2 gap-2', compact ? 'w-full sm:w-56' : 'w-full')}>
      <Button variant="outline" onClick={() => m.mutate('skipped')} disabled={m.isPending}>
        Skip
      </Button>
      <span className={cx('relative rounded-xl', ripple && 'ripple')}>
        <Button variant="green" className="w-full" onClick={() => m.mutate('taken')} loading={m.isPending && m.variables === 'taken'}>
          Taken
        </Button>
      </span>
    </div>
  );
}

function Meter({ value, goal }: { value: number; goal: number }) {
  return (
    <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-primary-50" aria-hidden>
      <span className="block h-full rounded-full bg-primary-600" style={{ width: `${Math.min(100, (value / Math.max(1, goal)) * 100)}%` }} />
    </span>
  );
}

export default function Dashboard() {
  const { data: me } = useMe();
  const tz = me?.timezone ?? 'Africa/Douala';
  const reminders = useQuery({ queryKey: ['reminders', 'today'], queryFn: () => api<{ items: Occurrence[] }>('/reminders?range=today'), retry: false });
  const water = useQuery({ queryKey: ['water'], queryFn: () => api<ActivitySummary>('/water'), retry: false });
  const steps = useQuery({ queryKey: ['steps'], queryFn: () => api<ActivitySummary>('/steps'), retry: false });
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

  const items = reminders.data?.items ?? [];
  const now = Date.now();
  const actionable = items.filter((o) => o.kind === 'medication' && o.canConfirm && o.status !== 'scheduled');
  const next = actionable[0] ?? items.find((o) => o.kind === 'medication' && new Date(o.scheduledFor).getTime() > now);
  const answered = items.filter((o) => o.kind === 'medication' && (o.status === 'taken' || o.status === 'skipped')).length;
  const medsToday = items.filter((o) => o.kind === 'medication').length;
  const upcomingCheckup = checkups.data?.items.find((c) => c.status === 'upcoming' && new Date(c.dueAt).getTime() > now);
  const todayLabel = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  return (
    <div className="mx-auto max-w-3xl">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{todayLabel}</p>
          <h1 className="text-2xl font-bold">
            {greeting(tz)}, {me?.displayName?.split(' ')[0] ?? 'there'}
          </h1>
        </div>
        <EcgLine className="mt-2 hidden h-6 w-24 text-secondary-400 sm:block" />
      </header>

      {sub.data?.tier === 'trial' ? (
        <p className="mt-2 text-sm text-muted">
          Free trial: {sub.data.daysLeft} day{sub.data.daysLeft === 1 ? '' : 's'} left. <Link to="/app/billing" className="font-semibold text-primary-700 underline underline-offset-2">See plan</Link>
        </p>
      ) : sub.data?.tier === 'premium' ? (
        <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-secondary-700">
          <Crown className="size-4" aria-hidden /> Premium active
        </p>
      ) : null}

      {/* Next reminder */}
      <section className="mt-5 rounded-[var(--radius-card)] border-2 border-primary-600 bg-white p-4" aria-labelledby="next-h">
        <h2 id="next-h" className="flex items-center gap-2 text-sm font-bold text-primary-700">
          <Bell className="size-4" aria-hidden /> Next medicine
          {medsToday ? <span className="font-normal text-muted">· {answered} of {medsToday} answered today</span> : null}
        </h2>
        {reminders.isPending ? (
          <Skeleton className="mt-3 h-16" />
        ) : locked(reminders.error) ? (
          <div className="mt-2 grid gap-3">
            <p className="text-[15px]">{(reminders.error as ApiError).code === 'PREMIUM_REQUIRED' ? 'Reminders are part of Premium, and your free trial has ended.' : 'To use reminders, first allow MEDIMATE to store your health information.'}</p>
            <LinkButton to={(reminders.error as ApiError).code === 'PREMIUM_REQUIRED' ? '/app/billing' : '/app/settings#consent'} className="justify-self-start">
              {(reminders.error as ApiError).code === 'PREMIUM_REQUIRED' ? 'See Premium' : 'Review permissions'}
            </LinkButton>
          </div>
        ) : next ? (
          <div className="mt-2 grid gap-3 sm:flex sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xl font-bold">
                {next.localTime} · {next.plan?.medicineName}
              </p>
              <p className="text-[15px] text-ink">{next.plan?.doseText}</p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                SMS code {next.ref}
                {next.status === 'sent' ? <StatusBadge status="sent" /> : null}
              </p>
            </div>
            {next.canConfirm && next.status !== 'scheduled' ? <ReminderActions o={next} compact /> : <Badge>Later today</Badge>}
          </div>
        ) : (
          <div className="mt-2 grid gap-3">
            <p className="text-[15px] text-muted">{medsToday ? 'All of today’s reminders are answered.' : 'No medicine reminders today.'}</p>
            <LinkButton to="/app/medicines/new" variant="outline" icon={Pill} className="justify-self-start">
              Add a medicine from my prescription
            </LinkButton>
          </div>
        )}
      </section>

      {invites.data?.items.length ? (
        <div className="mt-4">
          <Notice title="Someone asked you to be their caretaker">
            {invites.data.items[0]!.person?.displayName} would like your help with their reminders. <Link to="/care" className="font-semibold underline">Review the invitation</Link>
          </Notice>
        </div>
      ) : null}

      {/* Today */}
      <h2 className="mb-2 mt-7 text-lg font-bold">Today</h2>
      <List label="Today">
        <ListRow
          to="/app/water"
          icon={Droplets}
          title="Water"
          detail={
            water.data ? (
              <>
                {water.data.todayTotal} of {water.data.goal} ml
                <Meter value={water.data.todayTotal} goal={water.data.goal} />
              </>
            ) : locked(water.error) ? (
              'Premium'
            ) : (
              '…'
            )
          }
        />
        <ListRow
          to="/app/activity"
          icon={Footprints}
          title="Steps"
          detail={
            steps.data ? (
              <>
                {steps.data.todayTotal.toLocaleString()} of {steps.data.goal.toLocaleString()}
                <Meter value={steps.data.todayTotal} goal={steps.data.goal} />
              </>
            ) : locked(steps.error) ? (
              'Premium'
            ) : (
              '…'
            )
          }
        />
        <ListRow
          to="/app/checkups"
          icon={CalendarCheck}
          tone="green"
          title="Next checkup"
          detail={upcomingCheckup ? `${upcomingCheckup.title}, ${dateOnly(upcomingCheckup.dueAt, tz)}` : locked(checkups.error) ? 'Premium' : 'None planned'}
        />
        <ListRow to="/app/messages" icon={MessageSquare} title="Messages with pharmacies" />
        <ListRow to="/app/care" icon={Users} title="Caretakers" detail="Choose who can see what" />
      </List>

      {sub.data?.tier === 'free' ? (
        <div className="mt-4">
          <Notice tone="warning" icon={Crown} title="Your free trial has ended">
            Pharmacy search, prices, medicine information and messages stay free. <Link to="/app/billing" className="font-semibold underline">Premium</Link> brings back reminders and health logs.
          </Notice>
        </div>
      ) : null}

      {/* Nearby pharmacies */}
      <div className="mb-2 mt-7 flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">Verified pharmacies{me?.area ? ` near ${me.area}` : ''}</h2>
        <Link to="/find" className="text-sm font-semibold text-primary-700 underline underline-offset-2">
          Search
        </Link>
      </div>
      {nearby.isPending ? (
        <Skeleton className="h-40" />
      ) : (
        <List label="Nearby pharmacies">
          {(nearby.data?.items ?? []).slice(0, 5).map((p) => (
            <ListRow
              key={p.id}
              to={`/pharmacies/${p.id}`}
              icon={MapPin}
              title={p.name}
              detail={`${p.area} · ${p.openNow === null ? 'hours not listed' : p.openNow ? 'open now' : 'closed now'}`}
            />
          ))}
        </List>
      )}

      <HealthDisclaimer />
    </div>
  );
}
