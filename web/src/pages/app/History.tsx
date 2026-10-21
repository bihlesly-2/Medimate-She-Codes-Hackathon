import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, Download, FileText, HeartPulse, Pill, Plus, Stethoscope, Trash2, TriangleAlert } from 'lucide-react';
import { HealthDisclaimer } from '../../components/layout';
import { Badge, Button, Card, Chip, EmptyState, Field, Input, Notice, PageHeader, QueryView, SectionTitle, Select, StatusBadge, Textarea, Toggle, errorMessage, useToast } from '../../components/ui';
import { ApiError, api, del, patch, post } from '../../lib/api';
import { useMe } from '../../lib/auth';
import { dateTime } from '../../lib/format';

interface Item {
  type: 'reminder' | 'vital' | 'checkup' | 'reaction';
  at: string;
  title: string;
  detail: string;
  status?: string;
}
interface Reaction {
  id: string;
  description: string;
  symptoms: string[];
  severity: string;
  occurredAt: string;
  medicineName: string | null;
  showToClinician: boolean;
}

const ICON = { reminder: Pill, vital: HeartPulse, checkup: CalendarCheck, reaction: TriangleAlert };
const SYMPTOMS = ['nausea', 'rash', 'itching', 'dizziness', 'headache', 'stomach pain', 'diarrhoea', 'tiredness', 'swelling'];
const SECTIONS = [
  ['medicines', 'Medicines'],
  ['adherence', 'Reminder answers'],
  ['vitals', 'Readings'],
  ['checkups', 'Checkups'],
  ['reactions', 'Reactions marked for my clinician'],
] as const;

function nowLocalInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function History() {
  const { data: me } = useMe();
  const tz = me?.timezone;
  const qc = useQueryClient();
  const toast = useToast();
  const [types, setTypes] = useState<string[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const params = new URLSearchParams();
  if (types.length) params.set('types', types.join(','));
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const timeline = useQuery({ queryKey: ['history', params.toString()], queryFn: () => api<{ items: Item[] }>(`/history?${params}`) });
  const reactions = useQuery({ queryKey: ['reactions'], queryFn: () => api<{ items: Reaction[] }>('/reactions') });

  const [desc, setDesc] = useState('');
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [severity, setSeverity] = useState('mild');
  const [occurredAt, setOccurredAt] = useState(nowLocalInput());
  const [medicine, setMedicine] = useState('');
  const [share, setShare] = useState(false);
  const addReaction = useMutation({
    mutationFn: () => post('/reactions', { description: desc, symptoms, severity, occurredAt: new Date(occurredAt).toISOString(), medicineName: medicine || null, showToClinician: share }),
    onSuccess: () => {
      toast('Reaction saved.');
      setDesc('');
      setSymptoms([]);
      void qc.invalidateQueries({ queryKey: ['reactions'] });
      void qc.invalidateQueries({ queryKey: ['history'] });
    },
  });
  const flag = useMutation({
    mutationFn: (v: { id: string; show: boolean }) => patch(`/reactions/${v.id}`, { showToClinician: v.show }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['reactions'] }),
  });
  const removeReaction = useMutation({
    mutationFn: (id: string) => del(`/reactions/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reactions'] });
      void qc.invalidateQueries({ queryKey: ['history'] });
    },
  });

  const [sections, setSections] = useState<string[]>(SECTIONS.map(([k]) => k));
  const [days, setDays] = useState('90');
  const exportPdf = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/history/export.pdf?sections=${sections.join(',')}&days=${days}`, { credentials: 'same-origin' });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
        throw new ApiError(res.status, d?.error?.code ?? 'HTTP', d?.error?.message ?? 'Export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'medimate-health-summary.pdf';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    },
    onSuccess: () => toast('PDF downloaded.'),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="History" subtitle="Everything you recorded, in one timeline. Download a summary to show your clinician." />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="tl-h">
          <SectionTitle>
            <span id="tl-h">Timeline</span>
          </SectionTitle>
          <div className="mb-3 flex flex-wrap items-end gap-2">
            {(['reminder', 'vital', 'checkup', 'reaction'] as const).map((t) => (
              <Chip key={t} active={types.includes(t)} onClick={() => setTypes((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]))}>
                {t === 'reminder' ? 'Medicines' : t === 'vital' ? 'Readings' : t === 'checkup' ? 'Checkups' : 'Reactions'}
              </Chip>
            ))}
            <Field label="From">{(id) => <Input id={id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="!min-h-10 w-40" />}</Field>
            <Field label="To">{(id) => <Input id={id} type="date" value={to} onChange={(e) => setTo(e.target.value)} className="!min-h-10 w-40" />}</Field>
          </div>
          <QueryView query={timeline}>
            {(d) =>
              d.items.length === 0 ? (
                <EmptyState icon={FileText} title="Nothing in this period" />
              ) : (
                <ol className="relative grid gap-2 border-l-2 border-primary-100 pl-5">
                  {d.items.map((it, i) => {
                    const Icon = ICON[it.type];
                    return (
                      <li key={i} className="relative">
                        <span className="absolute -left-[31px] top-3 grid size-6 place-items-center rounded-full bg-white text-primary-600 ring-2 ring-primary-100">
                          <Icon className="size-3.5" aria-hidden />
                        </span>
                        <Card className="p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-semibold">{it.title}</p>
                            {it.status ? it.type === 'reaction' ? <Badge>{it.status}</Badge> : <StatusBadge status={it.status === 'upcoming' ? 'scheduled' : it.status === 'done' ? 'taken' : it.status} label={it.status === 'upcoming' ? 'Upcoming' : it.status === 'done' ? 'Done' : undefined} /> : null}
                          </div>
                          {it.detail ? <p className="text-sm text-muted">{it.detail}</p> : null}
                          <p className="text-xs text-muted">{dateTime(it.at, tz)}</p>
                        </Card>
                      </li>
                    );
                  })}
                </ol>
              )
            }
          </QueryView>
        </section>

        <div className="grid h-fit gap-5">
          <Card className="p-5">
            <SectionTitle>
              <span className="flex items-center gap-2">
                <Download className="size-5 text-primary-600" aria-hidden /> Summary for my clinician
              </span>
            </SectionTitle>
            <p className="text-sm text-muted">Choose what to include. Only your own information is ever exported.</p>
            <div className="mt-3 grid gap-1">
              {SECTIONS.map(([k, label]) => (
                <label key={k} className="flex min-h-9 items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4 accent-[var(--color-primary-600)]" checked={sections.includes(k)} onChange={(e) => setSections((s) => (e.target.checked ? [...s, k] : s.filter((x) => x !== k)))} />
                  {label}
                </label>
              ))}
            </div>
            <Field label="Period">
              {(id) => (
                <Select id={id} value={days} onChange={(e) => setDays(e.target.value)}>
                  <option value="30">Last 30 days</option>
                  <option value="90">Last 90 days</option>
                  <option value="365">Last 12 months</option>
                </Select>
              )}
            </Field>
            {exportPdf.isError ? (
              <div className="mt-3">
                <Notice tone={exportPdf.error instanceof ApiError && exportPdf.error.code === 'PREMIUM_REQUIRED' ? 'warning' : 'danger'}>{errorMessage(exportPdf.error)}</Notice>
              </div>
            ) : null}
            <Button className="mt-4 w-full" icon={Download} loading={exportPdf.isPending} disabled={!sections.length} onClick={() => exportPdf.mutate()}>
              Download PDF
            </Button>
          </Card>

          <Card className="p-5">
            <SectionTitle>
              <span className="flex items-center gap-2">
                <Stethoscope className="size-5 text-primary-600" aria-hidden /> Log a reaction
              </span>
            </SectionTitle>
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                addReaction.mutate();
              }}
            >
              <Field label="What happened?">{(id) => <Textarea id={id} required minLength={3} maxLength={1000} rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} />}</Field>
              <div>
                <p className="text-sm font-semibold">Anything from this list?</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {SYMPTOMS.map((s) => (
                    <Chip key={s} active={symptoms.includes(s)} onClick={() => setSymptoms((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]))}>
                      {s}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="How it felt to you">
                  {(id) => (
                    <Select id={id} value={severity} onChange={(e) => setSeverity(e.target.value)}>
                      <option value="mild">Mild</option>
                      <option value="moderate">Moderate</option>
                      <option value="severe">Severe</option>
                    </Select>
                  )}
                </Field>
                <Field label="When">{(id) => <Input id={id} type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />}</Field>
              </div>
              <Field label="Which medicine (if any)" optional>
                {(id) => <Input id={id} maxLength={120} value={medicine} onChange={(e) => setMedicine(e.target.value)} />}
              </Field>
              <Toggle checked={share} onChange={setShare} label="Show to my clinician" description="Included in the PDF summary when you choose reactions." />
              {severity === 'severe' ? <Notice tone="warning">If you feel very unwell, contact a health professional or local emergency services now.</Notice> : null}
              {addReaction.isError ? <Notice tone="danger">{errorMessage(addReaction.error)}</Notice> : null}
              <Button type="submit" icon={Plus} loading={addReaction.isPending}>
                Save reaction
              </Button>
            </form>
            <QueryView query={reactions}>
              {(d) =>
                d.items.length ? (
                  <ul className="mt-4 divide-y divide-border text-sm">
                    {d.items.map((r) => (
                      <li key={r.id} className="py-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold">
                              {r.medicineName ?? 'Reaction'} · {r.severity}
                            </p>
                            <p className="text-muted">{r.description}</p>
                            <p className="text-xs text-muted">{dateTime(r.occurredAt, tz)}</p>
                          </div>
                          <Button variant="ghost" size="sm" icon={Trash2} aria-label="Delete reaction" onClick={() => confirm('Delete this reaction?') && removeReaction.mutate(r.id)} />
                        </div>
                        <Toggle checked={r.showToClinician} onChange={(v) => flag.mutate({ id: r.id, show: v })} label="Show to my clinician" />
                      </li>
                    ))}
                  </ul>
                ) : null
              }
            </QueryView>
          </Card>
        </div>
      </div>
      <HealthDisclaimer />
    </div>
  );
}
