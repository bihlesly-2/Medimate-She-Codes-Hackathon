import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ACCEPTED_UNITS, VITAL_LABELS, VITAL_TYPES, type VitalType } from '@medimate/shared';
import { Lightbulb, Plus, Trash2 } from 'lucide-react';
import { LineChart } from '../../components/charts';
import { HealthDisclaimer } from '../../components/layout';
import { Button, Card, Chip, Field, Input, List, ListItem, Notice, PageHeader, QueryView, SectionTitle, Select, errorMessage, useToast } from '../../components/ui';
import { api, del, post } from '../../lib/api';
import { useMe } from '../../lib/auth';
import { dateTime } from '../../lib/format';
import type { Vital } from '../../lib/types';

interface Overview {
  latest: Record<VitalType, Vital | null>;
  series: Record<VitalType, Vital[]>;
  bmi: { value: number | null; note: string };
  rangeRules: null;
  disclaimer: string;
}
interface Tip {
  id: string;
  title: string;
  body: string;
  topic: string;
  source: string;
  isDemo: boolean;
  reviewedAt: string | null;
}

const fmt = (v: Vital) => (v.type === 'bp' ? `${v.value}/${v.value2}` : String(v.value));

export default function Health() {
  const { data: me } = useMe();
  const tz = me?.timezone;
  const qc = useQueryClient();
  const toast = useToast();
  const [type, setType] = useState<VitalType>('bp');
  const [value, setValue] = useState('');
  const [value2, setValue2] = useState('');
  const [unit, setUnit] = useState<string>(ACCEPTED_UNITS.bp[0]!);
  const [chartType, setChartType] = useState<VitalType>('bp');
  const overview = useQuery({ queryKey: ['vitals', 'overview'], queryFn: () => api<Overview>('/vitals/overview') });
  const tips = useQuery({ queryKey: ['tips', me?.language], queryFn: () => api<{ items: Tip[] }>(`/tips?lang=${me?.language ?? 'en'}`) });
  const add = useMutation({
    mutationFn: () => post<Vital>('/vitals', { type, value: Number(value.replace(',', '.')), value2: type === 'bp' ? Number(value2) : null, unit }),
    onSuccess: (v) => {
      toast(`Saved ${VITAL_LABELS[v.type as VitalType]}: ${fmt(v)} ${v.unit}.`);
      setValue('');
      setValue2('');
      setChartType(v.type as VitalType);
      void qc.invalidateQueries({ queryKey: ['vitals'] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/vitals/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['vitals'] }),
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Readings" subtitle="Keep a simple record to share with your health worker. Values are shown as you entered them. MEDIMATE does not label them normal or abnormal." />
      <QueryView query={overview}>
        {(o) => (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-start">
            <section aria-labelledby="latest-h" className="lg:col-start-1 lg:row-start-1">
              <SectionTitle>
                <span id="latest-h">Latest</span>
              </SectionTitle>
              <List label="Latest readings">
                {VITAL_TYPES.map((t) => {
                  const v = o.latest[t];
                  return (
                    <ListItem key={t} className="flex items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block font-semibold">{VITAL_LABELS[t]}</span>
                        <span className="block text-xs text-muted">{v ? dateTime(v.measuredAt, tz) : 'No reading yet'}</span>
                      </span>
                      {v ? (
                        <span className="shrink-0 text-right font-bold">
                          {fmt(v)} <span className="text-sm font-semibold text-muted">{v.unit}</span>
                        </span>
                      ) : null}
                    </ListItem>
                  );
                })}
                <ListItem className="text-sm">
                  <span className="font-semibold">BMI: {o.bmi.value ?? 'not shown'}</span>
                  <span className="block text-xs text-muted">{o.bmi.note}</span>
                </ListItem>
              </List>
            </section>

            <Card as="section" className="p-4 sm:p-5 lg:col-start-2 lg:row-span-2 lg:row-start-1" aria-labelledby="add-reading-h">
              <h2 id="add-reading-h" className="mb-3 text-lg font-bold">
                Add a reading
              </h2>
              <form
                className="grid gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  add.mutate();
                }}
              >
                <Field label="Type">
                  {(id) => (
                    <Select
                      id={id}
                      value={type}
                      onChange={(e) => {
                        const t = e.target.value as VitalType;
                        setType(t);
                        setUnit(ACCEPTED_UNITS[t][0]!);
                      }}
                    >
                      {VITAL_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {VITAL_LABELS[t]}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                {type === 'bp' ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Top number">{(id) => <Input id={id} inputMode="numeric" required value={value} onChange={(e) => setValue(e.target.value)} placeholder="120" />}</Field>
                    <Field label="Bottom number">{(id) => <Input id={id} inputMode="numeric" required value={value2} onChange={(e) => setValue2(e.target.value)} placeholder="80" />}</Field>
                  </div>
                ) : (
                  <Field label="Value">{(id) => <Input id={id} inputMode="decimal" required value={value} onChange={(e) => setValue(e.target.value)} />}</Field>
                )}
                <Field label="Unit" hint="Other units are converted and the original is kept.">
                  {(id, d) => (
                    <Select id={id} aria-describedby={d} value={unit} onChange={(e) => setUnit(e.target.value)}>
                      {ACCEPTED_UNITS[type].map((u) => (
                        <option key={u}>{u}</option>
                      ))}
                    </Select>
                  )}
                </Field>
                {add.isError ? <Notice tone="danger">{errorMessage(add.error)}</Notice> : null}
                <Button type="submit" icon={Plus} loading={add.isPending}>
                  Save reading
                </Button>
                <p className="text-xs text-muted">If you are worried about a reading or how you feel, contact a qualified health professional.</p>
              </form>
            </Card>

            <section aria-labelledby="history-h" className="lg:col-start-1 lg:row-start-2">
              <SectionTitle>
                <span id="history-h">History</span>
              </SectionTitle>
              <div className="scrollbar-none -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Choose a reading type">
                {VITAL_TYPES.map((t) => (
                  <Chip key={t} active={chartType === t} onClick={() => setChartType(t)}>
                    {VITAL_LABELS[t]}
                  </Chip>
                ))}
              </div>
              <Card className="p-4">
                <LineChart
                  title={`${VITAL_LABELS[chartType]} history`}
                  unit={o.latest[chartType]?.unit ?? ''}
                  points={o.series[chartType].map((v) => ({ label: new Date(v.measuredAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: tz }), value: v.value, value2: v.value2 }))}
                />
              </Card>
              {o.series[chartType].length ? (
                <List label={`${VITAL_LABELS[chartType]} entries`} className="mt-3">
                  {[...o.series[chartType]].reverse().map((v) => (
                    <ListItem key={v.id} className="flex items-center justify-between gap-2 !py-2">
                      <span className="min-w-0 text-sm">
                        <strong>
                          {fmt(v)} {v.unit}
                        </strong>
                        <span className="block text-xs text-muted">
                          {dateTime(v.measuredAt, tz)} · by {v.source}
                          {v.enteredUnit && v.enteredUnit !== v.unit ? ` · entered as ${v.enteredValue} ${v.enteredUnit}` : ''}
                        </span>
                      </span>
                      <Button variant="ghost" size="sm" icon={Trash2} aria-label="Delete reading" onClick={() => confirm('Delete this reading?') && remove.mutate(v.id)} />
                    </ListItem>
                  ))}
                </List>
              ) : null}
            </section>
          </div>
        )}
      </QueryView>

      <section className="mt-8" aria-labelledby="tips-h">
        <h2 id="tips-h" className="mb-3 flex items-center gap-2 text-lg font-bold">
          <Lightbulb className="size-5 text-secondary-600" aria-hidden /> Health tips
        </h2>
        <QueryView query={tips}>
          {(d) =>
            d.items.length === 0 ? (
              <p className="text-sm text-muted">No reviewed tips yet.</p>
            ) : (
              <List label="Health tips">
                {d.items.map((t) => (
                  <ListItem key={t.id}>
                    <p className="font-bold">{t.title}</p>
                    <p className="mt-0.5 text-sm text-ink">{t.body}</p>
                    <p className="mt-1 text-xs text-muted">
                      Source: {t.source}
                      {t.reviewedAt ? ` · reviewed ${t.reviewedAt.slice(0, 10)}` : ''}
                      {t.isDemo ? ' · fictional demo tip' : ''}
                    </p>
                  </ListItem>
                ))}
              </List>
            )
          }
        </QueryView>
      </section>
      <HealthDisclaimer />
    </div>
  );
}
