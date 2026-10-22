import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CalendarCheck, PackageCheck, Pencil, Pill } from 'lucide-react';
import { HealthDisclaimer } from '../../components/layout';
import { Badge, Button, Dialog, EmptyState, Field, LinkButton, List, ListItem, Notice, PageHeader, QueryView, Select, StatusBadge, Tabs, Textarea, errorMessage, useToast } from '../../components/ui';
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

function DeliveryBadge({ status }: { status: string | null | undefined }) {
  if (status === 'simulated') return <Badge tone="amber">SMS simulated</Badge>;
  if (status === 'web_only') return <Badge>In app</Badge>;
  if (status === 'retrying') return <Badge tone="amber">SMS retrying</Badge>;
  if (status === 'failed') return <Badge tone="red">SMS failed</Badge>;
  return null;
}

function title(o: Occurrence) {
  if (o.kind === 'medication') return o.plan?.medicineName;
  if (o.kind === 'refill') return `Refill coming up: ${o.plan?.medicineName}`;
  return `Checkup tomorrow: ${o.checkup?.title}`;
}

export default function Reminders() {
  const [range, setRange] = useState<'today' | 'upcoming' | 'history'>('today');
  const [correcting, setCorrecting] = useState<Occurrence | null>(null);
  const q = useQuery({ queryKey: ['reminders', range], queryFn: () => api<{ items: Occurrence[] }>(`/reminders?range=${range}`) });
  return (
    <div className="mx-auto max-w-3xl">
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
                    <section key={date} aria-label={date}>
                      <h2 className="mb-2 text-sm font-bold text-muted">
                        {sd.weekday} {sd.day} {sd.month}
                      </h2>
                      <List>
                        {list.map((o) => {
                          const Icon = KIND_ICON[o.kind];
                          const overdue = o.status === 'scheduled' && new Date(o.scheduledFor).getTime() < Date.now();
                          return (
                            <ListItem key={o.id} className="sm:flex sm:items-center sm:justify-between sm:gap-4">
                              <div className="flex min-w-0 items-start gap-3">
                                <Icon className="mt-0.5 size-5 shrink-0 text-primary-600" aria-hidden />
                                <div className="min-w-0">
                                  <p className="font-bold">
                                    {o.localTime} · {title(o)}
                                  </p>
                                  {o.plan && o.kind === 'medication' ? <p className="text-sm text-ink">{o.plan.doseText}</p> : null}
                                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                                    <StatusBadge status={overdue ? 'sent' : o.status} label={overdue ? 'Not answered' : undefined} />
                                    <span>SMS code {o.ref}</span>
                                    <DeliveryBadge status={o.deliveryStatus} />
                                    {o.confirmedChannel ? <span>answered by {o.confirmedChannel}</span> : null}
                                  </div>
                                </div>
                              </div>
                              <div className="mt-3 shrink-0 pl-8 sm:mt-0 sm:pl-0">
                                {range === 'history' && o.kind === 'medication' ? (
                                  <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setCorrecting(o)}>
                                    Correct
                                  </Button>
                                ) : o.kind === 'medication' && o.canConfirm ? (
                                  <ReminderActions o={o} compact />
                                ) : null}
                              </div>
                            </ListItem>
                          );
                        })}
                      </List>
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
