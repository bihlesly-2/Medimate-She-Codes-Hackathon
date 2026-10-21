import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Check, HeartHandshake, Lock, X } from 'lucide-react';
import { BarChart } from '../../components/charts';
import { CATEGORY_LABEL } from '../app/Care';
import { Badge, Button, Card, EmptyState, PageHeader, QueryView, SectionTitle, StatusBadge, errorMessage, useToast } from '../../components/ui';
import { api, post } from '../../lib/api';
import { dateTime } from '../../lib/format';
import type { CareLink, Vital } from '../../lib/types';
import type { CareCategory } from '@medimate/shared';

export function CaretakerHome() {
  const qc = useQueryClient();
  const toast = useToast();
  const invites = useQuery({ queryKey: ['care', 'invites'], queryFn: () => api<{ items: CareLink[] }>('/caretaker/invites') });
  const patients = useQuery({ queryKey: ['care', 'patients'], queryFn: () => api<{ items: CareLink[] }>('/caretaker/patients') });
  const respond = useMutation({
    mutationFn: (v: { id: string; accept: boolean }) => post(`/caretaker/invites/${v.id}/${v.accept ? 'accept' : 'decline'}`),
    onSuccess: (_r, v) => {
      toast(v.accept ? 'Invitation accepted.' : 'Invitation declined.');
      void qc.invalidateQueries({ queryKey: ['care'] });
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="People I care for" subtitle="You only see what each person chose to share with you, and only while they keep sharing." />
      <QueryView query={invites}>
        {(d) =>
          d.items.length ? (
            <section className="mb-6">
              <SectionTitle>Invitations</SectionTitle>
              <ul className="grid gap-2">
                {d.items.map((l) => (
                  <Card as="li" key={l.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-bold">{l.person?.displayName}</p>
                      <p className="text-sm text-muted">Would share: {l.categories.map((c) => CATEGORY_LABEL[c][0]).join(', ')}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="green" icon={Check} onClick={() => respond.mutate({ id: l.id, accept: true })}>
                        Accept
                      </Button>
                      <Button size="sm" variant="outline" icon={X} onClick={() => respond.mutate({ id: l.id, accept: false })}>
                        Decline
                      </Button>
                    </div>
                  </Card>
                ))}
              </ul>
            </section>
          ) : null
        }
      </QueryView>
      <QueryView query={patients}>
        {(d) =>
          d.items.length === 0 ? (
            <EmptyState icon={HeartHandshake} title="No one is sharing with you yet">
              When someone invites you with your phone number, the invitation appears here.
            </EmptyState>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {d.items.map((l) => (
                <li key={l.id}>
                  <Link to={`/care/${l.patientId}`}>
                    <Card className="p-5 transition-colors hover:border-primary-400">
                      <p className="text-lg font-bold">{l.person?.displayName}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {l.categories.map((c) => (
                          <Badge key={c} tone="blue">
                            {CATEGORY_LABEL[c][0]}
                          </Badge>
                        ))}
                      </div>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )
        }
      </QueryView>
    </div>
  );
}

interface Overview {
  patient: { id: string; displayName: string };
  categories: CareCategory[];
  alertDetail: boolean;
  reminders?: {
    today: { time: string; status: string; label: string }[];
    week: { taken: number; skipped: number; missed: number; pending: number; rate: number | null };
    alerts: { at: string; message: string }[];
  };
  checkups?: { id: string; title: string; dueAt: string; status: string }[];
  vitals?: Vital[];
  activity?: { steps: { daily: { date: string; total: number }[]; goal: number }; water: { daily: { date: string; total: number }[]; goal: number } };
  reactions?: { id: string; description: string; severity: string; occurredAt: string }[];
}

export function CaretakerPatient() {
  const { patientId = '' } = useParams();
  const q = useQuery({ queryKey: ['care', 'patient', patientId], queryFn: () => api<Overview>(`/caretaker/patients/${patientId}`), refetchInterval: 60_000 });
  const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'narrow', timeZone: 'UTC' });
  return (
    <div className="mx-auto max-w-4xl">
      <QueryView query={q}>
        {(o) => {
          const hidden = (['reminders', 'checkups', 'vitals', 'activity', 'reactions'] as CareCategory[]).filter((c) => !o.categories.includes(c));
          return (
            <>
              <PageHeader back="/care" title={o.patient.displayName} subtitle="Shared with you. Access is checked every time this page loads." />
              <div className="grid gap-5">
                {o.reminders ? (
                  <Card className="p-5">
                    <SectionTitle>Reminders today</SectionTitle>
                    {o.reminders.alerts.length ? (
                      <ul className="mb-3 grid gap-1.5">
                        {o.reminders.alerts.map((a, i) => (
                          <li key={i} className="flex items-center gap-2 rounded-xl bg-warning-bg px-3 py-2 text-sm text-[#6b3a00]">
                            <BellRing className="size-4" aria-hidden /> {a.message} · {dateTime(a.at)}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {o.reminders.today.length === 0 ? (
                      <p className="text-sm text-muted">No reminders have been sent today yet.</p>
                    ) : (
                      <ul className="grid gap-1.5">
                        {o.reminders.today.map((r, i) => (
                          <li key={i} className="flex items-center justify-between rounded-xl bg-bg px-3 py-2 text-sm">
                            <span>
                              {r.time} · {r.label}
                            </span>
                            <StatusBadge status={r.status} />
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-3 text-sm text-muted">
                      Last 7 days: {o.reminders.week.taken} taken, {o.reminders.week.skipped} skipped, {o.reminders.week.missed} not confirmed.
                    </p>
                  </Card>
                ) : null}
                {o.checkups ? (
                  <Card className="p-5">
                    <SectionTitle>Checkups</SectionTitle>
                    {o.checkups.length === 0 ? (
                      <p className="text-sm text-muted">None.</p>
                    ) : (
                      <ul className="grid gap-1.5 text-sm">
                        {o.checkups.map((c) => (
                          <li key={c.id} className="flex justify-between rounded-xl bg-bg px-3 py-2">
                            <span>{c.title}</span>
                            <span className="text-muted">{dateTime(c.dueAt)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                ) : null}
                {o.vitals ? (
                  <Card className="p-5">
                    <SectionTitle>Recent readings</SectionTitle>
                    <ul className="grid gap-1 text-sm">
                      {o.vitals.slice(0, 10).map((v) => (
                        <li key={v.id}>
                          {v.type}: <strong>{v.type === 'bp' ? `${v.value}/${v.value2}` : v.value}</strong> {v.unit} · <span className="text-muted">{dateTime(v.measuredAt)}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                ) : null}
                {o.activity ? (
                  <Card className="grid gap-6 p-5 md:grid-cols-2">
                    <div>
                      <SectionTitle>Steps (7 days)</SectionTitle>
                      <BarChart title="Steps" unit="steps" goal={o.activity.steps.goal} points={o.activity.steps.daily.map((d) => ({ label: day(d.date), value: d.total }))} />
                    </div>
                    <div>
                      <SectionTitle>Water (7 days)</SectionTitle>
                      <BarChart title="Water" unit="ml" goal={o.activity.water.goal} points={o.activity.water.daily.map((d) => ({ label: day(d.date), value: d.total }))} />
                    </div>
                  </Card>
                ) : null}
                {o.reactions ? (
                  <Card className="p-5">
                    <SectionTitle>Reactions</SectionTitle>
                    <ul className="grid gap-1 text-sm">
                      {o.reactions.map((r) => (
                        <li key={r.id}>
                          {r.description} <span className="text-muted">· {r.severity} · {dateTime(r.occurredAt)}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                ) : null}
                {hidden.length ? (
                  <p className="flex items-center gap-2 text-sm text-muted">
                    <Lock className="size-4" aria-hidden /> Not shared with you: {hidden.map((c) => CATEGORY_LABEL[c][0]).join(', ')}.
                  </p>
                ) : null}
              </div>
            </>
          );
        }}
      </QueryView>
    </div>
  );
}
