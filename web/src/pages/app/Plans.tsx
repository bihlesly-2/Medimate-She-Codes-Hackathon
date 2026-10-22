import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { planCreateSchema, type PlanCreate } from '@medimate/shared';
import { BellRing, CalendarDays, Clock, PackageCheck, Pencil, Pill, Plus, Square, X } from 'lucide-react';
import { HealthDisclaimer } from '../../components/layout';
import { Badge, Button, Card, Chip, EmptyState, Field, Input, LinkButton, List, ListItem, Notice, PageHeader, QueryView, Textarea, Toggle, errorMessage, useToast } from '../../components/ui';
import { api, del, fieldErrors, patch, post } from '../../lib/api';
import { useConfig, useMe } from '../../lib/auth';
import { todayIn } from '../../lib/format';
import type { Plan } from '../../lib/types';

export function PlansPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: config } = useConfig();
  const q = useQuery({ queryKey: ['plans'], queryFn: () => api<{ items: Plan[] }>('/plans') });
  const stop = useMutation({
    mutationFn: (id: string) => del(`/plans/${id}`),
    onSuccess: () => {
      toast('Plan stopped. Its history is kept.');
      void qc.invalidateQueries({ queryKey: ['plans'] });
      void qc.invalidateQueries({ queryKey: ['reminders'] });
    },
  });
  const test = useMutation({
    mutationFn: (id: string) => post<{ ref: string; deliveryStatus: string }>(`/plans/${id}/test-reminder`),
    onSuccess: (r) => {
      toast(`Test reminder ${r.ref} sent (${r.deliveryStatus === 'simulated' ? 'SMS simulated' : r.deliveryStatus === 'web_only' ? 'in app only' : r.deliveryStatus}).`, 'info');
      void qc.invalidateQueries({ queryKey: ['reminders'] });
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="My medicines"
        subtitle="Enter each medicine exactly as written on your prescription. MEDIMATE repeats your instructions and never calculates or changes a dose."
        actions={
          <LinkButton to="/app/medicines/new" icon={Plus}>
            Add medicine
          </LinkButton>
        }
      />
      <QueryView query={q}>
        {(d) =>
          d.items.length === 0 ? (
            <EmptyState icon={Pill} title="No medicines yet" action={<LinkButton to="/app/medicines/new">Add from my prescription</LinkButton>}>
              Add a medicine prescribed for you to start getting reminders.
            </EmptyState>
          ) : (
            <List label="My medicines">
              {d.items.map((p) => (
                <ListItem key={p.id} className={p.active ? '!py-4' : '!py-4 opacity-70'}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-lg font-bold">{p.medicineName}</p>
                      <p className="text-[15px] text-ink">{p.doseText}</p>
                      <p className="text-sm text-muted">
                        {p.frequencyText} · at {p.times.join(', ')}
                      </p>
                    </div>
                    {p.active ? <Badge tone="green">Active</Badge> : <Badge>Stopped</Badge>}
                  </div>
                  <ul className="mt-2 grid gap-0.5 text-xs text-muted">
                    <li className="flex items-center gap-1.5">
                      <CalendarDays className="size-3.5 shrink-0" aria-hidden /> From {p.startDate}
                      {p.endDate ? ` to ${p.endDate}` : ', no end date'}
                    </li>
                    {p.refillDate ? (
                      <li className="flex items-center gap-1.5">
                        <PackageCheck className="size-3.5 shrink-0" aria-hidden /> Refill on {p.refillDate}, reminder 2 days before at 09:00
                      </li>
                    ) : null}
                    <li className="flex items-center gap-1.5">
                      <Clock className="size-3.5 shrink-0" aria-hidden /> {p.smsReminders ? 'SMS and app reminders' : 'App reminders only'} · {p.caretakerAlerts ? 'caretaker alerted if not confirmed' : 'no caretaker alerts'}
                    </li>
                  </ul>
                  {p.notes ? <p className="mt-2 text-sm text-muted">Notes: {p.notes}</p> : null}
                  {p.active ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <LinkButton to={`/app/medicines/${p.id}`} variant="outline" size="sm" icon={Pencil}>
                        Edit
                      </LinkButton>
                      <Button variant="ghost" size="sm" icon={Square} onClick={() => confirm(`Stop reminders for ${p.medicineName}? History is kept.`) && stop.mutate(p.id)}>
                        Stop
                      </Button>
                      {config?.demoMode ? (
                        <Button variant="ghost" size="sm" icon={BellRing} loading={test.isPending && test.variables === p.id} onClick={() => test.mutate(p.id)}>
                          Test reminder now
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </ListItem>
              ))}
            </List>
          )
        }
      </QueryView>
      <HealthDisclaimer />
    </div>
  );
}

const PRESET_TIMES = ['06:00', '07:00', '08:00', '12:00', '13:00', '18:00', '20:00', '21:00', '22:00'];

export function PlanFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const existing = useQuery({ queryKey: ['plan', id], queryFn: () => api<Plan>(`/plans/${id}`), enabled: editing });
  const [customTime, setCustomTime] = useState('');
  const form = useForm<PlanCreate>({
    resolver: zodResolver(planCreateSchema) as never,
    defaultValues: {
      medicineName: '',
      doseText: '',
      frequencyText: '',
      times: ['08:00'],
      startDate: todayIn(me?.timezone ?? 'Africa/Douala'),
      endDate: null,
      refillDate: null,
      notes: null,
      smsReminders: true,
      caretakerAlerts: false,
    },
  });
  useEffect(() => {
    if (existing.data) {
      const p = existing.data;
      form.reset({
        medicineName: p.medicineName,
        doseText: p.doseText,
        frequencyText: p.frequencyText,
        times: p.times,
        startDate: p.startDate,
        endDate: p.endDate,
        refillDate: p.refillDate,
        notes: p.notes,
        smsReminders: p.smsReminders,
        caretakerAlerts: p.caretakerAlerts,
      });
    }
  }, [existing.data, form]);

  const save = useMutation({
    mutationFn: (v: PlanCreate) => (editing ? patch<Plan>(`/plans/${id}`, v) : post<Plan>('/plans', v)),
    onSuccess: () => {
      toast(editing ? 'Medicine updated. Future reminders follow the new schedule.' : 'Medicine added. Reminders are scheduled.');
      void qc.invalidateQueries({ queryKey: ['plans'] });
      void qc.invalidateQueries({ queryKey: ['reminders'] });
      nav('/app/medicines');
    },
    onError: (e) => {
      for (const [k, v] of Object.entries(fieldErrors(e))) form.setError(k as keyof PlanCreate, { message: v });
    },
  });
  const errors = form.formState.errors;
  const err = (k: keyof PlanCreate) => (errors[k]?.message as string | undefined) ?? undefined;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={editing ? 'Edit medicine' : 'Add a medicine'} back="/app/medicines" subtitle="Copy the instructions from your prescription or pharmacy label." />
      <Notice tone="warning" title="Only medicines prescribed or recommended for you">
        MEDIMATE stores your instructions as written. It cannot check doses. If you are unsure, ask a pharmacist or health worker.
      </Notice>
      <form className="mt-5 grid gap-5" onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate>
        <Card className="grid gap-4 p-5">
          <Field label="Medicine name and strength" error={err('medicineName')}>
            {(fid, d) => <Input id={fid} aria-describedby={d} aria-invalid={!!errors.medicineName} placeholder="e.g. Metformin 500 mg" {...form.register('medicineName')} />}
          </Field>
          <Field label="Dose exactly as prescribed" hint="Type it as written, e.g. “1 tablet after breakfast”." error={err('doseText')}>
            {(fid, d) => <Textarea id={fid} aria-describedby={d} aria-invalid={!!errors.doseText} rows={2} {...form.register('doseText')} />}
          </Field>
          <Field label="How often" hint="e.g. twice a day, every 8 hours, once a week" error={err('frequencyText')}>
            {(fid, d) => <Input id={fid} aria-describedby={d} aria-invalid={!!errors.frequencyText} {...form.register('frequencyText')} />}
          </Field>
        </Card>
        <Card className="p-5">
          <p className="text-sm font-semibold">Reminder times</p>
          <p className="text-xs text-muted">Local time ({me?.timezone ?? 'Africa/Douala'}). Choose the times on your prescription.</p>
          <Controller
            control={form.control}
            name="times"
            render={({ field }) => (
              <div className="mt-3">
                <div className="flex flex-wrap gap-2">
                  {[...new Set([...PRESET_TIMES, ...field.value])].sort().map((t) => {
                    const on = field.value.includes(t);
                    return (
                      <Chip key={t} active={on} onClick={() => field.onChange(on ? field.value.filter((x) => x !== t) : [...field.value, t].sort())}>
                        {t}
                      </Chip>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-end gap-2">
                  <Field label="Another time" optional>
                    {(fid) => <Input id={fid} type="time" value={customTime} onChange={(e) => setCustomTime(e.target.value)} className="w-36" />}
                  </Field>
                  <Button
                    variant="outline"
                    icon={Plus}
                    disabled={!/^\d{2}:\d{2}$/.test(customTime)}
                    onClick={() => {
                      if (!field.value.includes(customTime)) field.onChange([...field.value, customTime].sort());
                      setCustomTime('');
                    }}
                  >
                    Add
                  </Button>
                </div>
                {field.value.length ? (
                  <p className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
                    Selected:
                    {field.value.map((t) => (
                      <button key={t} type="button" onClick={() => field.onChange(field.value.filter((x) => x !== t))} className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-2 py-0.5 text-xs font-semibold text-white" aria-label={`Remove ${t}`}>
                        {t} <X className="size-3" aria-hidden />
                      </button>
                    ))}
                  </p>
                ) : null}
                {errors.times ? <p className="mt-2 text-xs font-medium text-danger">{errors.times.message as string}</p> : null}
              </div>
            )}
          />
        </Card>
        <Card className="grid gap-4 p-5 sm:grid-cols-3">
          <Field label="Start date" error={err('startDate')}>
            {(fid) => <Input id={fid} type="date" {...form.register('startDate')} />}
          </Field>
          <Field label="End date" optional error={err('endDate')}>
            {(fid) => <Input id={fid} type="date" {...form.register('endDate', { setValueAs: (v) => v || null })} />}
          </Field>
          <Field label="Refill date" optional hint="We remind you 2 days before, at 09:00." error={err('refillDate')}>
            {(fid, d) => <Input id={fid} aria-describedby={d} type="date" {...form.register('refillDate', { setValueAs: (v) => v || null })} />}
          </Field>
        </Card>
        <Card className="p-5">
          <Controller control={form.control} name="smsReminders" render={({ field }) => <Toggle checked={field.value} onChange={field.onChange} label="Also remind me by SMS" description="SMS reminders are generic (“time for your scheduled medicine”) and never name the medicine." />} />
          <Controller
            control={form.control}
            name="caretakerAlerts"
            render={({ field }) => (
              <Toggle
                checked={field.value}
                onChange={field.onChange}
                label="Alert my caretaker if I don’t confirm"
                description={
                  <>
                    Only caretakers you added with “reminders” sharing, after about an hour without an answer. <Link to="/app/care" className="font-semibold text-primary-700 underline">Manage caretakers</Link>
                  </>
                }
              />
            )}
          />
          <Field label="Notes" optional>
            {(fid) => <Textarea id={fid} rows={2} {...form.register('notes', { setValueAs: (v) => v || null })} />}
          </Field>
        </Card>
        {save.isError ? <Notice tone="danger">{errorMessage(save.error)}</Notice> : null}
        <div className="flex gap-2">
          <Button type="submit" size="lg" loading={save.isPending}>
            {editing ? 'Save changes' : 'Add medicine'}
          </Button>
          <LinkButton to="/app/medicines" variant="outline" size="lg">
            Cancel
          </LinkButton>
        </div>
      </form>
      <HealthDisclaimer />
    </div>
  );
}
