import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STOCK_CSV_HEADER, STOCK_STATES, STOCK_STATE_LABELS, WEEKDAY_NAMES } from '@medimate/shared';
import { ClipboardList, FileUp, MessageSquare, Plus, Save, ShieldCheck, Store, Trash2, Upload } from 'lucide-react';
import { Badge, Button, Card, DemoTag, EmptyState, Field, Input, LinkButton, List, ListItem, ListRow, Notice, PageHeader, QueryView, SectionTitle, Select, StatusBadge, StockBadge, Tabs, Textarea, errorMessage, useToast } from '../../components/ui';
import { api, post, put, del } from '../../lib/api';
import { dateTime, money } from '../../lib/format';

interface Profile {
  id: string;
  code: string;
  name: string;
  phone: string;
  address: string;
  area: string;
  town: string;
  isDemo: boolean;
  verificationStatus: string;
  verifiedUntil: string | null;
  hours: { weekday: number; opens: string; closes: string }[];
  verificationHistory: { id: string; status: string; notes: string | null; licenceNumber: string | null; documentReference: string | null; validUntil: string | null; createdAt: string }[];
}
interface StockRow {
  id: string;
  medicine: { id: string; label: string };
  price: number | null;
  currency: string;
  stockState: string;
  quantity: number | null;
  updatedAt: string;
  ageLabel: string;
  stale: boolean;
}
interface Analytics {
  periodDays: number;
  inquiries: Record<string, number>;
  medianFirstReplyMinutes: number | null;
  stock: { items: number; stale: number; updatesLast30Days: number };
  reports: Record<string, number>;
  source: string;
}

function useProfile() {
  return useQuery({ queryKey: ['pharmacy', 'profile'], queryFn: () => api<Profile>('/pharmacy/profile') });
}

export function PortalHome() {
  const profile = useProfile();
  const analytics = useQuery({ queryKey: ['pharmacy', 'analytics'], queryFn: () => api<Analytics>('/pharmacy/analytics') });
  return (
    <div className="mx-auto max-w-5xl">
      <QueryView query={profile}>
        {(p) => (
          <>
            <PageHeader
              title={p.name}
              subtitle={`${p.area}, ${p.town} · SMS code ${p.code}`}
              actions={
                <>
                  <LinkButton to="/pharmacy/stock" icon={Plus}>
                    Update stock
                  </LinkButton>
                  <LinkButton to="/pharmacy/inbox" variant="outline" icon={MessageSquare}>
                    Inquiries
                  </LinkButton>
                </>
              }
            />
            <div className="-mt-2 mb-5 flex flex-wrap gap-2">
              <StatusBadge status={p.verificationStatus} label={p.verificationStatus === 'approved' ? `Verified${p.verifiedUntil ? ` until ${p.verifiedUntil}` : ''}` : undefined} />
              {p.isDemo ? <DemoTag /> : null}
            </div>
            {p.verificationStatus !== 'approved' ? (
              <div className="mb-5">
                <Notice tone="warning" title="Not visible to the public yet">
                  Your pharmacy appears in search only after an administrator approves its verification. <Link to="/pharmacy/profile" className="font-semibold underline">Submit or check verification</Link>.
                </Notice>
              </div>
            ) : null}
          </>
        )}
      </QueryView>
      <QueryView query={analytics}>
        {(a) => (
          <>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <section aria-labelledby="ph-inq-h">
                <SectionTitle>
                  <span id="ph-inq-h">Inquiries</span>
                </SectionTitle>
                <List label="Inquiries">
                  <ListRow to="/pharmacy/inbox" icon={MessageSquare} title="Open" right={<strong>{a.inquiries.open ?? 0}</strong>} />
                  <ListItem className="flex justify-between gap-3 text-sm">
                    <span>Answered</span>
                    <strong>{a.inquiries.answered ?? 0}</strong>
                  </ListItem>
                  <ListItem className="flex justify-between gap-3 text-sm">
                    <span>Closed</span>
                    <strong>{a.inquiries.closed ?? 0}</strong>
                  </ListItem>
                  <ListItem className="flex justify-between gap-3 text-sm">
                    <span>Typical time to first reply</span>
                    <strong>{a.medianFirstReplyMinutes === null ? 'No replies yet' : `${a.medianFirstReplyMinutes} min`}</strong>
                  </ListItem>
                </List>
              </section>
              <section aria-labelledby="ph-stock-h">
                <SectionTitle>
                  <span id="ph-stock-h">Stock</span>
                </SectionTitle>
                <List label="Stock">
                  <ListRow to="/pharmacy/stock" icon={ClipboardList} title="Items listed" right={<strong>{a.stock.items}</strong>} />
                  <ListItem className="flex justify-between gap-3 text-sm">
                    <span>Not updated for over 48 hours</span>
                    <strong>{a.stock.stale}</strong>
                  </ListItem>
                  <ListItem className="flex justify-between gap-3 text-sm">
                    <span>Updates in the last 30 days</span>
                    <strong>{a.stock.updatesLast30Days}</strong>
                  </ListItem>
                  <ListItem className="flex justify-between gap-3 text-sm">
                    <span>Open reports about your pharmacy</span>
                    <strong>{(a.reports.open ?? 0) + (a.reports.investigating ?? 0)}</strong>
                  </ListItem>
                </List>
              </section>
            </div>
            <p className="mt-2 text-xs text-muted">
              Last {a.periodDays} days. {a.source}
            </p>
            {a.stock.stale ? (
              <div className="mt-4">
                <Notice tone="warning">{a.stock.stale} item(s) have not been updated for more than 48 hours, so patients see them as possibly out of date.</Notice>
              </div>
            ) : null}
          </>
        )}
      </QueryView>
    </div>
  );
}

export function StockPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const stock = useQuery({ queryKey: ['pharmacy', 'stock'], queryFn: () => api<{ items: StockRow[] }>('/pharmacy/stock') });
  const catalogue = useQuery({ queryKey: ['medicines', ''], queryFn: () => api<{ items: { id: string; label: string }[] }>('/medicines') });
  const [medicineId, setMedicineId] = useState('');
  const [price, setPrice] = useState('');
  const [state, setState] = useState('in_stock');
  const [qty, setQty] = useState('');
  const save = useMutation({
    mutationFn: (v: { medicineId: string; price: number | null; stockState: string; quantity: number | null }) => put('/pharmacy/stock', v),
    onSuccess: () => {
      toast('Stock updated. Patients see it as reported just now.');
      void qc.invalidateQueries({ queryKey: ['pharmacy'] });
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/pharmacy/stock/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['pharmacy'] }),
  });
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Stock and prices" subtitle="Each update is timestamped. Reports older than 48 hours are shown to patients as possibly out of date. Tap Still correct to confirm an item without changing it." actions={<LinkButton to="/pharmacy/import" variant="outline" icon={Upload}>CSV import</LinkButton>} />
      <Card className="mb-5 p-4 sm:p-5">
        <SectionTitle>Add or update one item</SectionTitle>
        <form
          className="grid grid-cols-2 gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_auto] md:items-end [&>*:first-child]:col-span-2 md:[&>*:first-child]:col-span-1 [&>button]:col-span-2 md:[&>button]:col-span-1"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({ medicineId, price: price === '' ? null : Number(price), stockState: state, quantity: qty === '' ? null : Number(qty) });
          }}
        >
          <Field label="Medicine">
            {(id) => (
              <Select id={id} required value={medicineId} onChange={(e) => setMedicineId(e.target.value)}>
                <option value="">Choose…</option>
                {catalogue.data?.items.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Price (FCFA)" optional>
            {(id) => <Input id={id} type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />}
          </Field>
          <Field label="Stock">
            {(id) => (
              <Select id={id} value={state} onChange={(e) => setState(e.target.value)}>
                {STOCK_STATES.map((s) => (
                  <option key={s} value={s}>
                    {STOCK_STATE_LABELS[s]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Quantity" optional>
            {(id) => <Input id={id} type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} />}
          </Field>
          <Button type="submit" icon={Save} loading={save.isPending} disabled={!medicineId}>
            Save
          </Button>
        </form>
      </Card>
      <QueryView query={stock}>
        {(d) =>
          d.items.length === 0 ? (
            <EmptyState icon={Store} title="No stock listed yet" />
          ) : (
            <List label="Your stock">
              {d.items.map((s) => (
                <ListItem key={s.id} className="sm:flex sm:items-center sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold">{s.medicine.label}</p>
                      <p className="shrink-0 font-bold sm:hidden">{money(s.price, s.currency)}</p>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <StockBadge state={s.stockState} stale={s.stale} />
                      <span className="text-xs text-muted">Updated {s.ageLabel}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2 sm:mt-0">
                    <p className="hidden w-28 text-right font-bold sm:block">{money(s.price, s.currency)}</p>
                    <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => save.mutate({ medicineId: s.medicine.id, price: s.price, stockState: s.stockState, quantity: s.quantity })}>
                      Still correct
                    </Button>
                    <Button size="sm" variant="ghost" icon={Trash2} aria-label={`Remove ${s.medicine.label}`} onClick={() => confirm('Remove this item?') && remove.mutate(s.id)} />
                  </div>
                </ListItem>
              ))}
            </List>
          )
        }
      </QueryView>
    </div>
  );
}

interface ImportResult {
  committed: boolean;
  valid: { line: number; label: string; price: number | null; stockState: string; quantity: number | null; change: 'new' | 'update' }[];
  issues: { line: number; message: string }[];
}

const SAMPLE_CSV = `${STOCK_CSV_HEADER.join(',')}
Paracetamol,500 mg,tablet,500,in stock,120
Amoxicillin,500 mg,capsule,1500,low,20
Oral rehydration salts (ORS),,sachet,300,in_stock,
Ibuprofen,400 mg,tablet,,unknown,`;

export function ImportPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [csv, setCsv] = useState(SAMPLE_CSV);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const preview = useMutation({ mutationFn: () => post<ImportResult>('/pharmacy/stock/import', { csv, commit: false }), onSuccess: setResult });
  const commit = useMutation({
    mutationFn: () => post<ImportResult>('/pharmacy/stock/import', { csv, commit: true }),
    onSuccess: (r) => {
      setResult(r);
      toast(`Imported ${r.valid.length} item(s).`);
      void qc.invalidateQueries({ queryKey: ['pharmacy'] });
    },
  });
  const onFile = async (f: File | undefined) => {
    setFileError(null);
    if (!f) return;
    if (!/\.csv$/i.test(f.name) && f.type !== 'text/csv') return setFileError('Please choose a .csv file.');
    if (f.size > 512 * 1024) return setFileError('The file is larger than 512 KB.');
    setCsv(await f.text());
    setResult(null);
  };
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="CSV import" subtitle="Upload many items at once. You see a preview first; nothing changes until every row is valid and you confirm." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="p-4 sm:p-5">
          <SectionTitle>1. Choose or paste a file</SectionTitle>
          <p className="text-xs text-muted">
            Columns: <code className="font-mono">{STOCK_CSV_HEADER.join(',')}</code>. stock_state: in stock, low, out or unknown.
          </p>
          <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-primary-400 bg-primary-50 px-4 py-3 text-sm font-semibold text-primary-700">
            <FileUp className="size-4" aria-hidden /> Choose CSV file
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
          {fileError ? <p className="mt-2 text-xs text-danger">{fileError}</p> : null}
          <Field label="CSV content">{(id) => <Textarea id={id} rows={10} className="font-mono text-xs" value={csv} onChange={(e) => { setCsv(e.target.value); setResult(null); }} />}</Field>
          <Button className="mt-3" onClick={() => preview.mutate()} loading={preview.isPending}>
            2. Preview
          </Button>
          {preview.isError ? <div className="mt-3"><Notice tone="danger">{errorMessage(preview.error)}</Notice></div> : null}
        </Card>
        <Card className="p-4 sm:p-5">
          <SectionTitle>Preview</SectionTitle>
          {!result ? (
            <p className="text-sm text-muted">Run a preview to see what will change.</p>
          ) : (
            <>
              {result.issues.length ? (
                <div className="mb-3">
                  <Notice tone="danger" title={`${result.issues.length} row(s) need fixing`}>
                    <ul className="mt-1 grid gap-0.5">
                      {result.issues.map((i, k) => (
                        <li key={k}>
                          Line {i.line}: {i.message}
                        </li>
                      ))}
                    </ul>
                  </Notice>
                </div>
              ) : result.committed ? (
                <div className="mb-3">
                  <Notice tone="success">Imported. Patients now see these items as reported just now.</Notice>
                </div>
              ) : (
                <div className="mb-3">
                  <Notice tone="success">All rows are valid.</Notice>
                </div>
              )}
              <ul className="max-h-72 divide-y divide-border overflow-y-auto text-sm">
                {result.valid.map((v) => (
                  <li key={v.line} className="flex items-center justify-between gap-2 py-1.5">
                    <span>
                      <span className="text-muted">L{v.line}</span> {v.label}
                    </span>
                    <span className="flex items-center gap-2">
                      {money(v.price)} · {STOCK_STATE_LABELS[v.stockState as keyof typeof STOCK_STATE_LABELS]}
                      <Badge tone={v.change === 'new' ? 'blue' : 'neutral'}>{v.change}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
              {!result.committed ? (
                <Button className="mt-4" variant="green" icon={Upload} disabled={result.issues.length > 0 || !result.valid.length} loading={commit.isPending} onClick={() => commit.mutate()}>
                  3. Import {result.valid.length} item(s)
                </Button>
              ) : null}
              {commit.isError ? <div className="mt-3"><Notice tone="danger">{errorMessage(commit.error)}</Notice></div> : null}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

interface InboxRow {
  id: string;
  subject: string;
  status: string;
  channel: string;
  updatedAt: string;
  patient: { displayName: string; phone: string };
}

export function InboxPage() {
  const [status, setStatus] = useState<'all' | 'open' | 'answered' | 'closed'>('open');
  const q = useQuery({ queryKey: ['pharmacy', 'inbox', status], queryFn: () => api<{ items: InboxRow[] }>(`/pharmacy/inbox${status === 'all' ? '' : `?status=${status}`}`) });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Inquiries" subtitle="Questions from patients by web, SMS and USSD. You never see their health records." />
      <Tabs
        label="Filter"
        value={status}
        onChange={setStatus}
        items={[
          { value: 'open', label: 'Open' },
          { value: 'answered', label: 'Answered' },
          { value: 'closed', label: 'Closed' },
          { value: 'all', label: 'All' },
        ]}
      />
      <div className="mt-4">
        <QueryView query={q}>
          {(d) =>
            d.items.length === 0 ? (
              <EmptyState icon={MessageSquare} title="Nothing here" />
            ) : (
              <List label="Inquiries">
                {d.items.map((i) => (
                  <ListRow
                    key={i.id}
                    to={`/pharmacy/inbox/${i.id}`}
                    icon={MessageSquare}
                    title={i.subject}
                    detail={
                      <>
                        <span className="block">
                          {i.patient.displayName} · {i.patient.phone}
                        </span>
                        <span className="block text-xs">
                          {dateTime(i.updatedAt)} · by {i.channel}
                        </span>
                      </>
                    }
                    right={<StatusBadge status={i.status} />}
                  />
                ))}
              </List>
            )
          }
        </QueryView>
      </div>
    </div>
  );
}

type HoursRow = { weekday: number; opens: string; closes: string };

function ProfileForm({ initial, onSubmit, submitting, label }: { initial: Partial<Profile>; onSubmit: (v: { name: string; phone: string; address: string; area: string; town: string; hours: HoursRow[] }) => void; submitting: boolean; label: string }) {
  const [name, setName] = useState(initial.name ?? '');
  const [phone, setPhone] = useState(initial.phone ?? '');
  const [address, setAddress] = useState(initial.address ?? '');
  const [area, setArea] = useState(initial.area ?? '');
  const [town, setTown] = useState(initial.town ?? 'Buea');
  const [hours, setHours] = useState<HoursRow[]>(initial.hours ?? []);
  useEffect(() => {
    if (initial.id) setHours(initial.hours ?? []);
  }, [initial.id, initial.hours]);
  const byDay = useMemo(() => new Map(hours.map((h) => [h.weekday, h])), [hours]);
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, phone, address, area, town, hours });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Pharmacy name">{(id) => <Input id={id} required minLength={3} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Phone">{(id) => <Input id={id} type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} />}</Field>
        <Field label="Address">{(id) => <Input id={id} required minLength={3} value={address} onChange={(e) => setAddress(e.target.value)} />}</Field>
        <Field label="Area">{(id) => <Input id={id} required minLength={2} value={area} onChange={(e) => setArea(e.target.value)} />}</Field>
        <Field label="Town">{(id) => <Input id={id} required minLength={2} value={town} onChange={(e) => setTown(e.target.value)} />}</Field>
      </div>
      <div>
        <p className="text-sm font-semibold">Opening hours (local time)</p>
        <div className="mt-2 grid gap-2">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => {
            const h = byDay.get(d);
            return (
              <div key={d} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <label className="flex min-h-10 w-32 items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={!!h}
                    onChange={(e) => setHours((s) => (e.target.checked ? [...s, { weekday: d, opens: '08:00', closes: '20:00' }] : s.filter((x) => x.weekday !== d)))}
                  />
                  {WEEKDAY_NAMES[d]}
                </label>
                {h ? (
                  <>
                    <Input type="time" aria-label={`${WEEKDAY_NAMES[d]} opens`} className="!min-h-10 w-[7.5rem]" value={h.opens} onChange={(e) => setHours((s) => s.map((x) => (x.weekday === d ? { ...x, opens: e.target.value } : x)))} />
                    <span>to</span>
                    <Input type="time" aria-label={`${WEEKDAY_NAMES[d]} closes`} className="!min-h-10 w-[7.5rem]" value={h.closes} onChange={(e) => setHours((s) => s.map((x) => (x.weekday === d ? { ...x, closes: e.target.value } : x)))} />
                  </>
                ) : (
                  <span className="text-muted">Closed</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <Button type="submit" loading={submitting} className="justify-self-start">
        {label}
      </Button>
    </form>
  );
}

export function ProfilePage() {
  const qc = useQueryClient();
  const toast = useToast();
  const profile = useProfile();
  const [licence, setLicence] = useState('');
  const [docRef, setDocRef] = useState('');
  const [notes, setNotes] = useState('');
  const save = useMutation({
    mutationFn: (v: unknown) => put('/pharmacy/profile', v),
    onSuccess: () => {
      toast('Profile saved.');
      void qc.invalidateQueries({ queryKey: ['pharmacy'] });
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const submit = useMutation({
    mutationFn: () => post('/pharmacy/verification', { licenceNumber: licence, documentReference: docRef, notes: notes || null }),
    onSuccess: () => {
      toast('Verification submitted for admin review.');
      void qc.invalidateQueries({ queryKey: ['pharmacy'] });
    },
  });
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Profile and verification" />
      <QueryView query={profile}>
        {(p) => (
          <div className="grid gap-5">
            <Card className="p-4 sm:p-5">
              <SectionTitle>Public profile</SectionTitle>
              <ProfileForm initial={p} submitting={save.isPending} label="Save profile" onSubmit={(v) => save.mutate(v)} />
            </Card>
            <Card className="p-4 sm:p-5">
              <SectionTitle>
                <span className="flex items-center gap-2">
                  <ShieldCheck className="size-5 text-secondary-600" aria-hidden /> Verification
                </span>
              </SectionTitle>
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={p.verificationStatus} />
                {p.verifiedUntil ? <Badge>Valid until {p.verifiedUntil}</Badge> : null}
              </div>
              <p className="mt-2 text-sm text-muted">Submit your licence number and a reference for your documents. An administrator checks them before your pharmacy becomes visible. Document upload is not part of this build, so the reference is checked offline.</p>
              {p.verificationStatus !== 'pending' ? (
                <form
                  className="mt-3 grid gap-3 sm:grid-cols-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submit.mutate();
                  }}
                >
                  <Field label="Licence number">{(id) => <Input id={id} required minLength={3} value={licence} onChange={(e) => setLicence(e.target.value)} />}</Field>
                  <Field label="Document reference">{(id) => <Input id={id} required minLength={3} value={docRef} onChange={(e) => setDocRef(e.target.value)} placeholder="e.g. file number or email subject" />}</Field>
                  <div className="sm:col-span-2">
                    <Field label="Notes" optional>
                      {(id) => <Textarea id={id} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}
                    </Field>
                  </div>
                  {submit.isError ? <div className="sm:col-span-2"><Notice tone="danger">{errorMessage(submit.error)}</Notice></div> : null}
                  <Button type="submit" loading={submit.isPending} className="justify-self-start">
                    Submit for verification
                  </Button>
                </form>
              ) : (
                <div className="mt-3">
                  <Notice>A verification request is waiting for review.</Notice>
                </div>
              )}
              <ol className="mt-5 grid gap-2 border-l-2 border-primary-100 pl-4 text-sm">
                {p.verificationHistory.map((h) => (
                  <li key={h.id}>
                    <StatusBadge status={h.status === 'submitted' ? 'pending' : h.status} label={h.status === 'submitted' ? 'Submitted' : undefined} /> <span className="text-muted">{dateTime(h.createdAt)}</span>
                    {h.licenceNumber ? <p className="text-xs text-muted">Licence {h.licenceNumber} · {h.documentReference}</p> : null}
                    {h.notes ? <p className="text-xs">{h.notes}</p> : null}
                  </li>
                ))}
              </ol>
            </Card>
          </div>
        )}
      </QueryView>
    </div>
  );
}

export function RegisterPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const m = useMutation({
    mutationFn: (v: unknown) => post('/pharmacy/register', v),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['me'] });
      nav('/pharmacy/profile');
    },
  });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Register a pharmacy" subtitle="Your pharmacy starts as a draft. It becomes visible to the public only after an administrator verifies it." />
      <Card className="p-4 sm:p-5">
        <ProfileForm initial={{}} submitting={m.isPending} label="Create pharmacy profile" onSubmit={(v) => m.mutate(v)} />
        {m.isError ? <div className="mt-3"><Notice tone="danger">{errorMessage(m.error)}</Notice></div> : null}
      </Card>
    </div>
  );
}
