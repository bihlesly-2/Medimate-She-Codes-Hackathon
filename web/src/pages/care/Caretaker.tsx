import { useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Check, HeartHandshake, Lock, X } from 'lucide-react';
import { BarChart } from '../../components/charts';
import { CATEGORY_LABEL } from '../app/Care';
import { Button, Card, EmptyState, List, ListItem, ListRow, Notice, PageHeader, QueryView, SectionTitle, StatusBadge, errorMessage, useToast } from '../../components/ui';
import { api, post } from '../../lib/api';
import { dateTime } from '../../lib/format';
import type { CareLink, Vital } from '../../lib/types';
import { VITAL_LABELS, type CareCategory, type VitalType } from '@medimate/shared';

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
    <div className="mx-auto max-w-3xl">
      <PageHeader title="People I care for" subtitle="You only see what each person chose to share with you, and only while they keep sharing." />
      <QueryView query={invites}>
        {(d) =>
          d.items.length ? (
            <section className="mb-6">
              <SectionTitle>Invitations</SectionTitle>
              <List label="Invitations">
                {d.items.map((l) => (
                  <ListItem key={l.id} className="sm:flex sm:items-center sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <p className="font-bold">{l.person?.displayName}</p>
                      <p className="text-sm text-muted">Would share: {l.categories.map((c) => CATEGORY_LABEL[c][0]).join(', ')}</p>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-0 sm:flex">
                      <Button size="sm" variant="green" icon={Check} onClick={() => respond.mutate({ id: l.id, accept: true })}>
                        Accept
                      </Button>
                      <Button size="sm" variant="outline" icon={X} onClick={() => respond.mutate({ id: l.id, accept: false })}>
                        Decline
                      </Button>
                    </div>
                  </ListItem>
                ))}
              </List>
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
            <List label="People sharing with you">
              {d.items.map((l) => (
                <ListRow key={l.id} to={`/care/${l.patientId}`} icon={HeartHandshake} title={l.person?.displayName ?? 'Person'} detail={`Shares: ${l.categories.map((c) => CATEGORY_LABEL[c][0]).join(', ')}`} />
              ))}
            </List>
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
    <div className="mx-auto max-w-3xl">
      <QueryView query={q}>
        {(o) => {
          const hidden = (['reminders', 'checkups', 'vitals', 'activity', 'reactions'] as CareCategory[]).filter((c) => !o.categories.includes(c));
          return (
            <>
              <PageHeader back="/care" title={o.patient.displayName} subtitle="Shared with you. Access is checked every time this page loads." />
              <div className="grid gap-6">
                {o.reminders ? (
                  <section aria-labelledby="c-rem-h">
                    <SectionTitle>
                      <span id="c-rem-h">Reminders today</span>
                    </SectionTitle>
                    {o.reminders.alerts.length ? (
                      <div className="mb-3 grid gap-2">
                        {o.reminders.alerts.map((a, i) => (
                          <Notice key={i} tone="warning" icon={BellRing}>
                            {a.message} · {dateTime(a.at)}
                          </Notice>
                        ))}
                      </div>
                    ) : null}
                    {o.reminders.today.length === 0 ? (
                      <p className="text-sm text-muted">No reminders have been sent today yet.</p>
                    ) : (
                      <List label="Reminders today">
                        {o.reminders.today.map((r, i) => (
                          <ListItem key={i} className="flex items-center justify-between gap-3 text-sm">
                            <span>
                              {r.time} · {r.label}
                            </span>
                            <StatusBadge status={r.status} />
                          </ListItem>
                        ))}
                      </List>
                    )}
                    <p className="mt-2 text-sm text-muted">
                      Last 7 days: {o.reminders.week.taken} taken, {o.reminders.week.skipped} skipped, {o.reminders.week.missed} not confirmed.
                    </p>
                  </section>
                ) : null}
                {o.checkups ? (
                  <section aria-labelledby="c-chk-h">
                    <SectionTitle>
                      <span id="c-chk-h">Checkups</span>
                    </SectionTitle>
                    {o.checkups.length === 0 ? (
                      <p className="text-sm text-muted">None planned.</p>
                    ) : (
                      <List label="Checkups">
                        {o.checkups.map((c) => (
                          <ListItem key={c.id} className="flex justify-between gap-3 text-sm">
                            <span className="font-semibold">{c.title}</span>
                            <span className="text-muted">{dateTime(c.dueAt)}</span>
                          </ListItem>
                        ))}
                      </List>
                    )}
                  </section>
                ) : null}
                {o.vitals ? (
                  <section aria-labelledby="c-vit-h">
                    <SectionTitle>
                      <span id="c-vit-h">Recent readings</span>
                    </SectionTitle>
                    {o.vitals.length === 0 ? (
                      <p className="text-sm text-muted">No readings yet.</p>
                    ) : (
                      <List label="Recent readings">
                        {o.vitals.slice(0, 10).map((v) => (
                          <ListItem key={v.id} className="flex justify-between gap-3 text-sm">
                            <span>
                              <span className="block font-semibold">{VITAL_LABELS[v.type as VitalType] ?? v.type}</span>
                              <span className="block text-xs text-muted">{dateTime(v.measuredAt)}</span>
                            </span>
                            <span className="font-bold">
                              {v.type === 'bp' ? `${v.value}/${v.value2}` : v.value} <span className="font-semibold text-muted">{v.unit}</span>
                            </span>
                          </ListItem>
                        ))}
                      </List>
                    )}
                  </section>
                ) : null}
                {o.activity ? (
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <section aria-labelledby="c-steps-h">
                      <SectionTitle>
                        <span id="c-steps-h">Steps, last 7 days</span>
                      </SectionTitle>
                      <Card className="p-4">
                        <BarChart title="Steps" unit="steps" goal={o.activity.steps.goal} points={o.activity.steps.daily.map((d) => ({ label: day(d.date), value: d.total }))} />
                      </Card>
                    </section>
                    <section aria-labelledby="c-water-h">
                      <SectionTitle>
                        <span id="c-water-h">Water, last 7 days</span>
                      </SectionTitle>
                      <Card className="p-4">
                        <BarChart title="Water" unit="ml" goal={o.activity.water.goal} points={o.activity.water.daily.map((d) => ({ label: day(d.date), value: d.total }))} />
                      </Card>
                    </section>
                  </div>
                ) : null}
                {o.reactions ? (
                  <section aria-labelledby="c-react-h">
                    <SectionTitle>
                      <span id="c-react-h">Reactions</span>
                    </SectionTitle>
                    {o.reactions.length === 0 ? (
                      <p className="text-sm text-muted">None logged.</p>
                    ) : (
                      <List label="Reactions">
                        {o.reactions.map((r) => (
                          <ListItem key={r.id} className="text-sm">
                            <p>{r.description}</p>
                            <p className="text-xs text-muted">
                              {r.severity} · {dateTime(r.occurredAt)}
                            </p>
                          </ListItem>
                        ))}
                      </List>
                    )}
                  </section>
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
