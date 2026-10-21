import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { REPORT_REASONS, WEEKDAY_NAMES } from '@medimate/shared';
import { CalendarClock, Clock, Flag, MessageSquare, Package, Phone, ShieldCheck } from 'lucide-react';
import { MapPinIcon } from '../../components/brand';
import { Badge, Button, Card, DemoTag, Dialog, Field, Input, Notice, QueryView, Select, StockBadge, Textarea, errorMessage, useToast } from '../../components/ui';
import { api, post } from '../../lib/api';
import { useMe } from '../../lib/auth';
import { money } from '../../lib/format';
import type { PharmacyPublic } from '../../lib/types';

interface Detail extends PharmacyPublic {
  stock: { stockId: string; medicine: { id: string; label: string }; price: number | null; currency: string; stockState: string; updatedAt: string; ageLabel: string; stale: boolean }[];
}

const REASON_LABEL: Record<string, string> = {
  wrong_stock: 'Stock was different',
  wrong_price: 'Price was different',
  closed: 'Pharmacy was closed / moved',
  suspicious: 'Something seemed unsafe or suspicious',
  other: 'Other',
};

export default function PharmacyDetail() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['pharmacy', id], queryFn: () => api<Detail>(`/pharmacies/${id}`) });
  const me = useMe();
  const nav = useNavigate();
  const toast = useToast();
  const [ask, setAsk] = useState(false);
  const [report, setReport] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [reason, setReason] = useState<string>('wrong_stock');
  const [details, setDetails] = useState('');

  const askM = useMutation({
    mutationFn: () => post<{ id: string }>('/inquiries', { pharmacyId: id, subject, body }),
    onSuccess: (r) => {
      toast('Message sent to the pharmacy.');
      nav(`/app/messages/${r.id}`);
    },
  });
  const reportM = useMutation({
    mutationFn: () => post('/reports', { pharmacyId: id, reason, details }),
    onSuccess: () => {
      setReport(false);
      toast('Thank you. An administrator will review your report.');
    },
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link to="/find" className="text-sm font-semibold text-primary-700 hover:underline">
        ← Back to search
      </Link>
      <QueryView query={q}>
        {(p) => (
          <div className="mt-3">
            <Card className="overflow-hidden">
              <div className="bg-[linear-gradient(160deg,#e8f3fd_0%,#e9f7ec_100%)] px-5 pb-6 pt-6 sm:px-8">
                <div className="flex flex-wrap items-start gap-4">
                  <span className="grid size-16 place-items-center rounded-2xl bg-white text-primary-600 shadow-sm">
                    <MapPinIcon className="size-9" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {p.isDemo ? <DemoTag /> : null}
                      <Badge tone="green" icon={ShieldCheck}>
                        Verified by MEDIMATE admin{p.verifiedUntil ? ` · until ${p.verifiedUntil}` : ''}
                      </Badge>
                    </div>
                    <h1 className="mt-2 text-2xl font-bold text-ink sm:text-3xl">{p.name}</h1>
                    <p className="text-muted">
                      {p.address} · {p.area}, {p.town}
                    </p>
                  </div>
                </div>
                <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
                  {[
                    { icon: Clock, label: 'Now', value: p.openNow === null ? 'Hours not listed' : p.openNow ? 'Open' : 'Closed' },
                    { icon: Package, label: 'Medicines listed', value: String(p.stock.length) },
                    { icon: CalendarClock, label: 'Code for SMS', value: p.code },
                  ].map((t) => (
                    <div key={t.label} className="rounded-2xl bg-white p-3 text-center shadow-sm">
                      <t.icon className="mx-auto size-5 text-primary-600" aria-hidden />
                      <p className="mt-1 text-[11px] text-muted">{t.label}</p>
                      <p className="text-sm font-bold text-ink sm:text-base">{t.value}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-border px-5 py-4 sm:px-8">
                <a href={`tel:${p.phone}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700">
                  <Phone className="size-4" aria-hidden /> Call {p.phone}
                </a>
                <Button variant="outline" icon={MessageSquare} onClick={() => (me.data ? setAsk(true) : nav(`/login?next=/pharmacies/${id}`))}>
                  Ask this pharmacy
                </Button>
                <Button variant="ghost" icon={Flag} onClick={() => (me.data ? setReport(true) : nav(`/login?next=/pharmacies/${id}`))}>
                  Report a problem
                </Button>
              </div>
            </Card>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
              <section aria-labelledby="stock-h">
                <h2 id="stock-h" className="mb-3 text-lg font-bold">
                  Last reported stock &amp; prices
                </h2>
                {p.stock.length === 0 ? (
                  <p className="text-sm text-muted">This pharmacy has not reported any stock yet.</p>
                ) : (
                  <ul className="grid gap-2">
                    {p.stock.map((s) => (
                      <Card as="li" key={s.stockId} className="flex flex-wrap items-center justify-between gap-2 p-4">
                        <div className="min-w-0">
                          <Link to={`/medicines/${s.medicine.id}`} className="font-semibold text-ink hover:text-primary-700 hover:underline">
                            {s.medicine.label}
                          </Link>
                          <div className="mt-1">
                            <StockBadge state={s.stockState} stale={s.stale} />
                          </div>
                          <p className="mt-1 text-xs text-muted">Reported {s.ageLabel}</p>
                        </div>
                        <p className="text-lg font-extrabold">{money(s.price, s.currency)}</p>
                      </Card>
                    ))}
                  </ul>
                )}
              </section>
              <aside>
                <h2 className="mb-3 text-lg font-bold">Opening hours</h2>
                <Card className="p-4">
                  {p.hours.length === 0 ? (
                    <p className="text-sm text-muted">Not provided by the pharmacy.</p>
                  ) : (
                    <dl className="grid gap-1.5 text-sm">
                      {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                        const h = p.hours.filter((x) => x.weekday === d);
                        return (
                          <div key={d} className="flex justify-between gap-3">
                            <dt className="text-muted">{WEEKDAY_NAMES[d]}</dt>
                            <dd className="font-semibold">{h.length ? h.map((x) => `${x.opens}–${x.closes}`).join(', ') : 'Closed'}</dd>
                          </div>
                        );
                      })}
                    </dl>
                  )}
                  <p className="mt-3 text-xs text-muted">Times are local (West Africa Time). Public holidays may differ.</p>
                </Card>
                <div className="mt-4">
                  <Notice>MEDIMATE shows what this pharmacy last reported. It does not guarantee a medicine is available right now.</Notice>
                </div>
              </aside>
            </div>

            <Dialog
              open={ask}
              onClose={() => setAsk(false)}
              title={`Ask ${p.name}`}
              footer={
                <>
                  <Button variant="outline" onClick={() => setAsk(false)}>
                    Cancel
                  </Button>
                  <Button loading={askM.isPending} disabled={subject.trim().length < 3 || body.trim().length < 2} onClick={() => askM.mutate()}>
                    Send
                  </Button>
                </>
              }
            >
              <div className="grid gap-3">
                <Field label="Subject">{(fid, d) => <Input id={fid} aria-describedby={d} value={subject} maxLength={120} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Do you have ORS sachets?" />}</Field>
                <Field label="Message" hint="Do not include private health details you do not want to share.">
                  {(fid, d) => <Textarea id={fid} aria-describedby={d} value={body} maxLength={1000} onChange={(e) => setBody(e.target.value)} />}
                </Field>
                {askM.isError ? <Notice tone="danger">{errorMessage(askM.error)}</Notice> : null}
              </div>
            </Dialog>

            <Dialog
              open={report}
              onClose={() => setReport(false)}
              title="Report a problem with this pharmacy"
              footer={
                <>
                  <Button variant="outline" onClick={() => setReport(false)}>
                    Cancel
                  </Button>
                  <Button loading={reportM.isPending} onClick={() => reportM.mutate()}>
                    Send report
                  </Button>
                </>
              }
            >
              <div className="grid gap-3">
                <Field label="What was wrong?">
                  {(fid) => (
                    <Select id={fid} value={reason} onChange={(e) => setReason(e.target.value)}>
                      {REPORT_REASONS.map((r) => (
                        <option key={r} value={r}>
                          {REASON_LABEL[r]}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Details" optional>
                  {(fid) => <Textarea id={fid} value={details} maxLength={500} onChange={(e) => setDetails(e.target.value)} />}
                </Field>
                {reportM.isError ? <Notice tone="danger">{errorMessage(reportM.error)}</Notice> : null}
              </div>
            </Dialog>
          </div>
        )}
      </QueryView>
    </div>
  );
}
