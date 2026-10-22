import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { REPORT_REASONS, WEEKDAY_NAMES } from '@medimate/shared';
import { ArrowLeft, Clock, Flag, Hash, MapPin, MessageSquare, Phone, ShieldCheck } from 'lucide-react';
import { Badge, Button, DemoTag, Dialog, Field, Input, List, ListItem, ListRow, Notice, QueryView, Select, StockBadge, Textarea, errorMessage, useToast } from '../../components/ui';
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
  closed: 'Pharmacy was closed or has moved',
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
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
      <Link to="/find" className="inline-flex items-center gap-1 text-sm font-semibold text-primary-700 hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> Back to search
      </Link>
      <QueryView query={q}>
        {(p) => (
          <div className="mt-3">
            <header>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="green" icon={ShieldCheck}>
                  Verified by MEDIMATE admin{p.verifiedUntil ? ` until ${p.verifiedUntil}` : ''}
                </Badge>
                {p.isDemo ? <DemoTag /> : null}
              </div>
              <h1 className="mt-2 text-2xl font-bold text-ink sm:text-3xl">{p.name}</h1>
              <p className="text-muted">
                {p.address} · {p.area}, {p.town}
              </p>
            </header>

            <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
              <a href={`tel:${p.phone}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 font-semibold text-white hover:bg-primary-700">
                <Phone className="size-4" aria-hidden /> Call {p.phone}
              </a>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Button variant="outline" icon={MessageSquare} onClick={() => (me.data ? setAsk(true) : nav(`/login?next=/pharmacies/${id}`))}>
                  Ask a question
                </Button>
                <Button variant="outline" icon={Flag} onClick={() => (me.data ? setReport(true) : nav(`/login?next=/pharmacies/${id}`))}>
                  Report a problem
                </Button>
              </div>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr] lg:items-start">
              <section aria-labelledby="stock-h">
                <h2 id="stock-h" className="mb-2 text-lg font-bold">
                  Last reported stock and prices
                </h2>
                {p.stock.length === 0 ? (
                  <p className="text-sm text-muted">This pharmacy has not reported any stock yet.</p>
                ) : (
                  <List label="Reported stock">
                    {p.stock.map((s) => (
                      <ListItem key={s.stockId}>
                        <div className="flex items-start justify-between gap-3">
                          <Link to={`/medicines/${s.medicine.id}`} className="min-w-0 font-semibold text-ink hover:text-primary-700 hover:underline">
                            {s.medicine.label}
                          </Link>
                          <p className="shrink-0 font-bold">{money(s.price, s.currency)}</p>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <StockBadge state={s.stockState} stale={s.stale} />
                          <span className="text-xs text-muted">Reported {s.ageLabel}</span>
                        </div>
                      </ListItem>
                    ))}
                  </List>
                )}
                <p className="mt-2 text-xs text-muted">MEDIMATE shows what this pharmacy last reported. It does not guarantee a medicine is available right now.</p>
              </section>

              <aside className="grid gap-6">
                <section aria-labelledby="about-h">
                  <h2 id="about-h" className="mb-2 text-lg font-bold">
                    Details
                  </h2>
                  <List label="Pharmacy details">
                    <ListRow icon={Clock} title={p.openNow === null ? 'Hours not listed' : p.openNow ? 'Open now' : 'Closed now'} detail="Local time (West Africa Time)" />
                    <ListRow icon={MapPin} title={`${p.area}, ${p.town}`} detail={p.address} />
                    <ListRow icon={Hash} title={`Pharmacy code ${p.code}`} detail={`By SMS: CONTACT ${p.code} and your question`} />
                  </List>
                </section>
                <section aria-labelledby="hours-h">
                  <h2 id="hours-h" className="mb-2 text-lg font-bold">
                    Opening hours
                  </h2>
                  {p.hours.length === 0 ? (
                    <p className="text-sm text-muted">Not provided by the pharmacy.</p>
                  ) : (
                    <List label="Opening hours">
                      {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                        const h = p.hours.filter((x) => x.weekday === d);
                        return (
                          <ListItem key={d} className="flex justify-between gap-3 !py-2.5 text-sm">
                            <span className="text-muted">{WEEKDAY_NAMES[d]}</span>
                            <span className="font-semibold">{h.length ? h.map((x) => `${x.opens} to ${x.closes}`).join(', ') : 'Closed'}</span>
                          </ListItem>
                        );
                      })}
                    </List>
                  )}
                  <p className="mt-2 text-xs text-muted">Public holidays may differ.</p>
                </section>
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
