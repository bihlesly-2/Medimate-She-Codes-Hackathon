import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, CalendarPlus, Check, MapPin, X } from 'lucide-react';
import { HealthDisclaimer } from '../../components/layout';
import { Button, Card, EmptyState, Field, Input, Notice, PageHeader, QueryView, StatusBadge, Textarea, Toggle, errorMessage, useToast } from '../../components/ui';
import { api, patch, post } from '../../lib/api';
import { useMe } from '../../lib/auth';
import { dateTime, todayIn } from '../../lib/format';

interface Checkup {
  id: string;
  title: string;
  dueAt: string;
  location: string | null;
  notes: string | null;
  remindDayBefore: boolean;
  status: 'upcoming' | 'done' | 'cancelled';
}

export default function Checkups() {
  const { data: me } = useMe();
  const tz = me?.timezone ?? 'Africa/Douala';
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['checkups'], queryFn: () => api<{ items: Checkup[] }>('/checkups') });
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(todayIn(tz));
  const [dueTime, setDueTime] = useState('10:00');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [remind, setRemind] = useState(true);
  const add = useMutation({
    mutationFn: () => post('/checkups', { title, dueDate, dueTime, location: location || null, notes: notes || null, remindDayBefore: remind }),
    onSuccess: () => {
      toast('Checkup added.');
      setTitle('');
      setLocation('');
      setNotes('');
      void qc.invalidateQueries({ queryKey: ['checkups'] });
    },
  });
  const update = useMutation({
    mutationFn: (v: { id: string; status: string }) => patch(`/checkups/${v.id}`, { status: v.status }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['checkups'] }),
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Checkups" subtitle="Visits you or your care team planned, like a blood pressure check or an antenatal visit. MEDIMATE never creates clinical schedules for you." />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <QueryView query={q}>
          {(d) =>
            d.items.length === 0 ? (
              <EmptyState icon={CalendarCheck} title="No checkups yet">
                Add your next appointment to get a reminder the day before.
              </EmptyState>
            ) : (
              <ul className="grid gap-2">
                {d.items.map((c) => (
                  <Card as="li" key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="font-bold">{c.title}</p>
                      <p className="text-sm text-muted">{dateTime(c.dueAt, tz)}</p>
                      {c.location ? (
                        <p className="flex items-center gap-1 text-xs text-muted">
                          <MapPin className="size-3.5" aria-hidden /> {c.location}
                        </p>
                      ) : null}
                      <div className="mt-1">
                        <StatusBadge status={c.status === 'upcoming' ? 'scheduled' : c.status === 'done' ? 'taken' : 'closed'} label={c.status === 'upcoming' ? 'Upcoming' : c.status === 'done' ? 'Done' : 'Cancelled'} />
                      </div>
                    </div>
                    {c.status === 'upcoming' ? (
                      <div className="flex gap-2">
                        <Button size="sm" variant="green" icon={Check} onClick={() => update.mutate({ id: c.id, status: 'done' })}>
                          Done
                        </Button>
                        <Button size="sm" variant="ghost" icon={X} onClick={() => update.mutate({ id: c.id, status: 'cancelled' })}>
                          Cancel
                        </Button>
                      </div>
                    ) : null}
                  </Card>
                ))}
              </ul>
            )
          }
        </QueryView>
        <Card className="h-fit p-5">
          <h2 className="flex items-center gap-2 font-bold">
            <CalendarPlus className="size-5 text-primary-600" aria-hidden /> Add a checkup
          </h2>
          <form
            className="mt-3 grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate();
            }}
          >
            <Field label="What is it?">{(id) => <Input id={id} required minLength={2} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Blood pressure check" />}</Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Date">{(id) => <Input id={id} type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} />}</Field>
              <Field label="Time">{(id) => <Input id={id} type="time" required value={dueTime} onChange={(e) => setDueTime(e.target.value)} />}</Field>
            </div>
            <Field label="Where" optional>
              {(id) => <Input id={id} maxLength={120} value={location} onChange={(e) => setLocation(e.target.value)} />}
            </Field>
            <Field label="Notes" optional>
              {(id) => <Textarea id={id} rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />}
            </Field>
            <Toggle checked={remind} onChange={setRemind} label="Remind me the day before" />
            {add.isError ? <Notice tone="danger">{errorMessage(add.error)}</Notice> : null}
            <Button type="submit" loading={add.isPending}>
              Add checkup
            </Button>
          </form>
        </Card>
      </div>
      <HealthDisclaimer />
    </div>
  );
}
