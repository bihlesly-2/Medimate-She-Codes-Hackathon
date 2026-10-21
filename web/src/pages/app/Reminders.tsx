import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CalendarCheck, PackageCheck, Pencil, Pill } from 'lucide-react';
import { HealthDisclaimer } from '../../components/layout';
import { Badge, Button, Card, Dialog, EmptyState, Field, LinkButton, Notice, PageHeader, QueryView, Select, StatusBadge, Tabs, Textarea, errorMessage, useToast } from '../../components/ui';
import { api, post } from '../../lib/api';
import { shortDay } from '../../lib/format';
import type { Occurrence } from '../../lib/types';
import { ReminderActions } from './Dashboard';

const KIND_ICON = { medication: Pill, refill: PackageCheck, checkup: CalendarCheck } as const;

function CorrectDialog({ o, onClose }: { o: Occurrence; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState(o.status === 'taken' ? 'skipped' : 'taken');
  const [reason, setReason] = useState('');
  const m = useMutation({
    mutationFn: () => post(`/reminders/${o.id}/correct`, { status, reason }),
    onSuccess: () => {
      toast('Corrected. The change is kept in your history.');
      void qc.invalidateQueries({ queryKey: ['reminders'] });
      onClose();
    },
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title="Correct this answer"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={m.isPending} disabled={reason.trim().length < 3} onClick={() => m.mutate()}>
            Save correction
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <p>
          {o.plan?.medicineName} at {o.localTime} on {o.localDate} is recorded as <strong>{o.status}</strong>.
        </p>
        <Field label="Change to">
          {(id) => (
            <Select id={id} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="taken">Taken</option>
              <option value="skipped">Skipped</option>
              <option value="missed">Not taken (missed)</option>
            </Select>
          )}
        </Field>
        <Field label="Reason" hint="For example: I took it but forgot to reply.">
          {(id, d) => <Textarea id={id} aria-describedby={d} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />}
        </Field>
        {m.isError ? <Notice tone="danger">{errorMessage(m.error)}</Notice> : null}
      </div>
    </Dialog>
  );
}

export default function Reminders() {
  const [range, setRange] = useState<'today' | 'upcoming' | 'history'>('today');
  const [correcting, setCorrecting] = useState<Occurrence | null>(null);
  const q = useQuery({ queryKey: ['reminders', range], queryFn: () => api<{ items: Occurrence[] }>(`/reminders?range=${range}`) });
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Reminders"
        subtitle="Reminders come from the prescriptions you entered. Answer here, or reply TAKEN or SKIP to the SMS."
        actions={
          <LinkButton to="/app/medicines/new" icon={Pill} variant="outline">
            Add medicine
          </LinkButton>
        }
      />
      <Tabs
        label="Reminder range"
        value={range}
        onChange={setRange}
        items={[
          { value: 'today', label: 'Today' },
          { value: 'upcoming', label: 'Next 7 days' },
          { value: 'history', label: 'Last 30 days' },
        ]}
      />
      <div className="mt-5">
        <QueryView query={q}>
          {(d) => {
            if (!d.items.length) {
              return (
                <EmptyState icon={Bell} title={range === 'history' ? 'No answered reminders yet' : 'Nothing scheduled'} action={<LinkButton to="/app/medicines/new">Add from my prescription</LinkButton>}>
                  Add a medicine from your prescription to get reminders.
                </EmptyState>
              );
            }
            const byDate = new Map<string, Occurrence[]>();
            for (const o of d.items) byDate.set(o.localDate, [...(byDate.get(o.localDate) ?? []), o]);
            return (
              <div className="grid gap-6">
                {[...byDate.entries()].map(([date, list]) => {
                  const sd = shortDay(date);
                  return (
                    <section key={date} aria-label={date} className="grid gap-2 sm:grid-cols-[72px_1fr]">
                      <div className="flex items-center gap-2 sm:flex-col sm:items-stretch">
                        <div className="grid w-16 place-items-center rounded-2xl border border-border bg-white py-2 text-center shadow-sm">
                          <span className="text-[11px] font-semibold text-muted">{sd.weekday}</span>
                          <span className="text-xl font-bold leading-tight">{sd.day}</span>
                          <span className="text-[11px] text-muted">{sd.month}</span>
                        </div>
                      </div>
                      <ul className="grid gap-2">
                        {list.map((o) => {
                          const Icon = KIND_ICON[o.kind];
                          return (
                            <Card as="li" key={o.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                              <div className="flex min-w-0 items-center gap-3">
                                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-600">
                                  <Icon className="size-5" aria-hidden />
                                </span>
                                <div className="min-w-0">
                                  <p className="font-bold">
                                    {o.localTime} ·{' '}
                                    {o.kind === 'medication' ? o.plan?.medicineName : o.kind === 'refill' ? `Refill coming up: ${o.plan?.medicineName}` : `Checkup tomorrow: ${o.checkup?.title}`}
                                  </p>
                                  {o.plan && o.kind === 'medication' ? <p className="truncate text-sm text-muted">{o.plan.doseText}</p> : null}
                                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                                    <StatusBadge status={o.status === 'scheduled' && new Date(o.scheduledFor).getTime() < Date.now() ? 'sent' : o.status} label={o.status === 'scheduled' && new Date(o.scheduledFor).getTime() < Date.now() ? 'Not answered' : undefined} />
                                    <span>code {o.ref}</span>
                                    {o.deliveryStatus === 'simulated' ? <Badge tone="amber">SMS simulated</Badge> : o.deliveryStatus === 'web_only' ? <Badge>In app</Badge> : o.deliveryStatus === 'retrying' ? <Badge tone="amber">SMS retrying</Badge> : o.deliveryStatus === 'failed' ? <Badge tone="red">SMS failed</Badge> : null}
                                    {o.confirmedChannel ? <span>answered via {o.confirmedChannel}</span> : null}
                                  </div>
                                </div>
                              </div>
                              {range === 'history' && o.kind === 'medication' ? (
                                <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setCorrecting(o)}>
                                  Correct
                                </Button>
                              ) : o.kind === 'medication' ? (
                                <ReminderActions o={o} compact />
                              ) : (
                                <StatusBadge status={o.status} />
                              )}
                            </Card>
                          );
                        })}
                      </ul>
                    </section>
                  );
                })}
              </div>
            );
          }}
        </QueryView>
      </div>
      {correcting ? <CorrectDialog o={correcting} onClose={() => setCorrecting(null)} /> : null}
      <HealthDisclaimer />
    </div>
  );
}
