import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PREMIUM_FEATURES, ROLES } from '@medimate/shared';
import { Check, Flag, HeartPulse, Pencil, Pill, Plus, ShieldCheck, X } from 'lucide-react';
import { Badge, Button, Card, Chip, DemoTag, Dialog, EmptyState, Field, Input, Notice, PageHeader, QueryView, SectionTitle, Select, StatusBadge, Tabs, Textarea, Toggle, errorMessage, useToast } from '../../components/ui';
import { api, post, put } from '../../lib/api';
import { hasRole, useMe } from '../../lib/auth';
import { dateTime } from '../../lib/format';

function useInvalidate() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ['admin'] });
}

export function AdminHome() {
  const { data: me } = useMe();
  const q = useQuery({ queryKey: ['admin', 'overview'], queryFn: () => api<Record<string, number>>('/admin/overview') });
  const isAdmin = hasRole(me, 'admin');
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={isAdmin ? 'Admin' : 'Clinical review'} subtitle="Work waiting for a decision. Counts come straight from the database." />
      <QueryView query={q}>
        {(o) => (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { to: '/admin/pharmacies', label: 'Pharmacies waiting for verification', n: o.pharmaciesPending, icon: ShieldCheck, admin: true },
              { to: '/admin/reports', label: 'Open stock / pharmacy reports', n: o.reportsOpen, icon: Flag, admin: true },
              { to: '/admin/medicines', label: 'Medicine records in review', n: o.medicinesInReview, icon: Pill },
              { to: '/admin/tips', label: 'Health tips in review', n: o.tipsInReview, icon: HeartPulse },
              { to: '/admin/pharmacies', label: 'Verified pharmacies', n: o.pharmaciesApproved, icon: ShieldCheck, admin: true },
            ]
              .filter((c) => isAdmin || !c.admin)
              .map((c) => (
                <Link key={c.label} to={c.to}>
                  <Card className="p-5 transition-colors hover:border-primary-400">
                    <c.icon className="size-5 text-primary-600" aria-hidden />
                    <p className="mt-2 text-3xl font-extrabold">{c.n}</p>
                    <p className="text-sm text-muted">{c.label}</p>
                  </Card>
                </Link>
              ))}
          </div>
        )}
      </QueryView>
    </div>
  );
}

interface AdminPharmacy {
  id: string;
  code: string;
  name: string;
  area: string;
  town: string;
  address: string;
  phone: string;
  isDemo: boolean;
  verificationStatus: string;
  verifiedUntil: string | null;
  history: { status: string; notes: string | null; licenceNumber: string | null; documentReference: string | null; validUntil: string | null; createdAt: string }[];
}

export function AdminPharmacies() {
  const inv = useInvalidate();
  const toast = useToast();
  const [status, setStatus] = useState<'pending' | 'approved' | 'all'>('pending');
  const q = useQuery({ queryKey: ['admin', 'pharmacies', status], queryFn: () => api<{ items: AdminPharmacy[] }>(`/admin/pharmacies${status === 'all' ? '' : `?status=${status}`}`) });
  const [deciding, setDeciding] = useState<AdminPharmacy | null>(null);
  const [decision, setDecision] = useState('approved');
  const [notes, setNotes] = useState('');
  const nextYear = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);
  const [validUntil, setValidUntil] = useState(nextYear);
  const decide = useMutation({
    mutationFn: () => post(`/admin/pharmacies/${deciding!.id}/decision`, { status: decision, notes, validUntil: decision === 'approved' ? validUntil : null }),
    onSuccess: () => {
      toast('Decision recorded in the verification history and audit log.');
      setDeciding(null);
      setNotes('');
      inv();
    },
  });
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Pharmacy verification" subtitle="Only approved pharmacies with a valid date appear in public search." />
      <Tabs label="Status" value={status} onChange={setStatus} items={[{ value: 'pending', label: 'Waiting' }, { value: 'approved', label: 'Approved' }, { value: 'all', label: 'All' }]} />
      <div className="mt-4">
        <QueryView query={q}>
          {(d) =>
            d.items.length === 0 ? (
              <EmptyState icon={ShieldCheck} title="Nothing to review" />
            ) : (
              <ul className="grid gap-3">
                {d.items.map((p) => (
                  <Card as="li" key={p.id} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold">
                          {p.name} <span className="font-mono text-sm text-muted">{p.code}</span>
                        </p>
                        <p className="text-sm text-muted">
                          {p.address} · {p.area}, {p.town} · {p.phone}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <StatusBadge status={p.verificationStatus} />
                          {p.verifiedUntil ? <Badge>until {p.verifiedUntil}</Badge> : null}
                          {p.isDemo ? <DemoTag /> : null}
                        </div>
                      </div>
                      <Button size="sm" onClick={() => setDeciding(p)}>
                        Decide
                      </Button>
                    </div>
                    <ol className="mt-3 grid gap-1 border-l-2 border-primary-100 pl-3 text-xs">
                      {p.history.map((h, i) => (
                        <li key={i}>
                          <strong>{h.status}</strong> · {dateTime(h.createdAt)}
                          {h.licenceNumber ? ` · licence ${h.licenceNumber} · ${h.documentReference}` : ''}
                          {h.notes ? ` · ${h.notes}` : ''}
                        </li>
                      ))}
                    </ol>
                  </Card>
                ))}
              </ul>
            )
          }
        </QueryView>
      </div>
      <Dialog
        open={!!deciding}
        onClose={() => setDeciding(null)}
        title={`Decision for ${deciding?.name ?? ''}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setDeciding(null)}>
              Cancel
            </Button>
            <Button loading={decide.isPending} disabled={notes.trim().length < 3} onClick={() => decide.mutate()}>
              Record decision
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="Decision">
            {(id) => (
              <Select id={id} value={decision} onChange={(e) => setDecision(e.target.value)}>
                <option value="approved">Approve</option>
                <option value="rejected">Reject</option>
                <option value="suspended">Suspend</option>
                <option value="expired">Mark expired</option>
              </Select>
            )}
          </Field>
          {decision === 'approved' ? <Field label="Valid until">{(id) => <Input id={id} type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />}</Field> : null}
          <Field label="Evidence checked / notes">{(id) => <Textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
          {decide.isError ? <Notice tone="danger">{errorMessage(decide.error)}</Notice> : null}
        </div>
      </Dialog>
    </div>
  );
}

interface AdminMedicine {
  id: string;
  label: string;
  name: string;
  genericName: string;
  strength: string;
  form: string;
  infoStatus: string;
  isDemo: boolean;
  submittedBy: string | null;
  verifiedAt: string | null;
  content: Record<string, string | null>;
}
const CONTENT_FIELDS = [
  ['indications', 'Uses (from source)'],
  ['usageNotes', 'Usage notes'],
  ['warnings', 'Warnings'],
  ['interactions', 'Interactions'],
  ['storage', 'Storage'],
  ['sideEffects', 'Common side effects'],
] as const;

function MedicineEditor({ m, onClose }: { m: AdminMedicine | null; onClose: () => void }) {
  const inv = useInvalidate();
  const toast = useToast();
  const [v, setV] = useState<Record<string, string>>({});
  useEffect(() => {
    setV({
      name: m?.name ?? '',
      genericName: m?.genericName ?? '',
      strength: m?.strength ?? '',
      form: m?.form ?? '',
      ...Object.fromEntries(Object.entries(m?.content ?? {}).map(([k, val]) => [k, val ?? ''])),
    });
  }, [m]);
  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { ...v };
      for (const k of Object.keys(body)) if (body[k] === '' && !['strength', 'form'].includes(k)) body[k] = null;
      return m ? put(`/admin/medicines/${m.id}`, body) : post('/admin/medicines', body);
    },
    onSuccess: () => {
      toast('Saved. Clinical content now waits for a different reviewer.');
      inv();
      onClose();
    },
  });
  const set = (k: string) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Dialog
      open
      onClose={onClose}
      title={m ? `Edit ${m.label}` : 'Add a medicine'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid max-h-[60vh] gap-3 overflow-y-auto pr-1">
        <Notice tone="warning">Only copy text from an authoritative source and record it below. Never write clinical content from memory.</Notice>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Name">{(id) => <Input id={id} value={v.name ?? ''} onChange={set('name')} />}</Field>
          <Field label="Generic name">{(id) => <Input id={id} value={v.genericName ?? ''} onChange={set('genericName')} />}</Field>
          <Field label="Strength">{(id) => <Input id={id} value={v.strength ?? ''} onChange={set('strength')} />}</Field>
          <Field label="Form">{(id) => <Input id={id} value={v.form ?? ''} onChange={set('form')} />}</Field>
        </div>
        {CONTENT_FIELDS.map(([k, label]) => (
          <Field key={k} label={label} optional>
            {(id) => <Textarea id={id} rows={2} value={v[k] ?? ''} onChange={set(k)} />}
          </Field>
        ))}
        <Field label="Source authority" optional>
          {(id) => <Input id={id} value={v.sourceAuthority ?? ''} onChange={set('sourceAuthority')} />}
        </Field>
        <Field label="Source link" optional>
          {(id) => <Input id={id} type="url" value={v.sourceUrl ?? ''} onChange={set('sourceUrl')} />}
        </Field>
        <Field label="Source version date" optional>
          {(id) => <Input id={id} type="date" value={v.sourceVersionDate ?? ''} onChange={set('sourceVersionDate')} />}
        </Field>
        {save.isError ? <Notice tone="danger">{errorMessage(save.error)}</Notice> : null}
      </div>
    </Dialog>
  );
}

function ReviewDialog({ title, path, onClose }: { title: string; path: string; onClose: () => void }) {
  const inv = useInvalidate();
  const toast = useToast();
  const [notes, setNotes] = useState('');
  const m = useMutation({
    mutationFn: (decision: 'approve' | 'reject') => post(path, { decision, notes }),
    onSuccess: (_r, d) => {
      toast(d === 'approve' ? 'Approved and published.' : 'Returned for changes.');
      inv();
      onClose();
    },
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="outline" icon={X} disabled={notes.trim().length < 3} loading={m.isPending && m.variables === 'reject'} onClick={() => m.mutate('reject')}>
            Return
          </Button>
          <Button variant="green" icon={Check} disabled={notes.trim().length < 3} loading={m.isPending && m.variables === 'approve'} onClick={() => m.mutate('approve')}>
            Approve
          </Button>
        </>
      }
    >
      <Field label="Review notes" hint="Required. Recorded with your name and the date.">
        {(id, d) => <Textarea id={id} aria-describedby={d} value={notes} onChange={(e) => setNotes(e.target.value)} />}
      </Field>
      {m.isError ? (
        <div className="mt-3">
          <Notice tone="danger">{errorMessage(m.error)}</Notice>
        </div>
      ) : null}
    </Dialog>
  );
}

export function AdminMedicines() {
  const q = useQuery({ queryKey: ['admin', 'medicines'], queryFn: () => api<{ items: AdminMedicine[] }>('/admin/medicines') });
  const [editing, setEditing] = useState<AdminMedicine | null | 'new'>(null);
  const [reviewing, setReviewing] = useState<AdminMedicine | null>(null);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Medicine catalogue"
        subtitle="A record is “verified” only after a reviewer other than the editor approves it with a source and version date."
        actions={
          <Button icon={Plus} onClick={() => setEditing('new')}>
            Add medicine
          </Button>
        }
      />
      <QueryView query={q}>
        {(d) => (
          <ul className="grid gap-2">
            {d.items.map((m) => (
              <Card as="li" key={m.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-bold">{m.label}</p>
                  <p className="text-xs text-muted">
                    {m.content.sourceAuthority ? `Source: ${m.content.sourceAuthority} (${m.content.sourceVersionDate ?? 'no date'})` : 'No source recorded'}
                    {m.verifiedAt ? ` · verified ${m.verifiedAt.slice(0, 10)}` : ''}
                  </p>
                  <div className="mt-1 flex gap-1.5">
                    <StatusBadge status={m.infoStatus} />
                    {m.isDemo ? <DemoTag /> : null}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" icon={Pencil} onClick={() => setEditing(m)}>
                    Edit
                  </Button>
                  {m.infoStatus === 'in_review' ? (
                    <Button size="sm" icon={ShieldCheck} onClick={() => setReviewing(m)}>
                      Review
                    </Button>
                  ) : null}
                </div>
              </Card>
            ))}
          </ul>
        )}
      </QueryView>
      {editing ? <MedicineEditor m={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
      {reviewing ? <ReviewDialog title={`Review ${reviewing.label}`} path={`/admin/medicines/${reviewing.id}/review`} onClose={() => setReviewing(null)} /> : null}
    </div>
  );
}

interface AdminTip {
  id: string;
  title: string;
  body: string;
  topic: string;
  language: string;
  source: string;
  status: string;
  isDemo: boolean;
  reviewNotes: string | null;
}

export function AdminTips() {
  const inv = useInvalidate();
  const toast = useToast();
  const q = useQuery({ queryKey: ['admin', 'tips'], queryFn: () => api<{ items: AdminTip[] }>('/admin/tips') });
  const [reviewing, setReviewing] = useState<AdminTip | null>(null);
  const [form, setForm] = useState({ title: '', body: '', topic: '', language: 'en', source: '' });
  const create = useMutation({
    mutationFn: () => post('/admin/tips', form),
    onSuccess: () => {
      toast('Tip submitted for review.');
      setForm({ title: '', body: '', topic: '', language: 'en', source: '' });
      inv();
    },
  });
  const archive = useMutation({ mutationFn: (id: string) => post(`/admin/tips/${id}/archive`), onSuccess: inv });
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Health tips" subtitle="Only tips approved by a reviewer other than the author are published. Tips are general information, never personal clinical advice." />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <QueryView query={q}>
          {(d) => (
            <ul className="grid gap-2">
              {d.items.map((t) => (
                <Card as="li" key={t.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold">{t.title}</p>
                      <p className="text-sm">{t.body}</p>
                      <p className="mt-1 text-xs text-muted">
                        {t.topic} · {t.language} · {t.source}
                        {t.reviewNotes ? ` · review: ${t.reviewNotes}` : ''}
                      </p>
                      <div className="mt-1 flex gap-1.5">
                        <StatusBadge status={t.status} />
                        {t.isDemo ? <DemoTag /> : null}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {t.status === 'in_review' ? (
                        <Button size="sm" onClick={() => setReviewing(t)}>
                          Review
                        </Button>
                      ) : null}
                      {t.status === 'published' ? (
                        <Button size="sm" variant="ghost" onClick={() => archive.mutate(t.id)}>
                          Archive
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </Card>
              ))}
            </ul>
          )}
        </QueryView>
        <Card className="h-fit p-5">
          <SectionTitle>Write a tip</SectionTitle>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <Field label="Title">{(id) => <Input id={id} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />}</Field>
            <Field label="Text">{(id) => <Textarea id={id} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />}</Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Topic">{(id) => <Input id={id} value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />}</Field>
              <Field label="Language">
                {(id) => (
                  <Select id={id} value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
                    <option value="en">English</option>
                    <option value="fr">Français</option>
                    <option value="pcm">Pidgin</option>
                  </Select>
                )}
              </Field>
            </div>
            <Field label="Source">{(id) => <Input id={id} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />}</Field>
            {create.isError ? <Notice tone="danger">{errorMessage(create.error)}</Notice> : null}
            <Button type="submit" loading={create.isPending}>
              Submit for review
            </Button>
          </form>
        </Card>
      </div>
      {reviewing ? <ReviewDialog title={`Review “${reviewing.title}”`} path={`/admin/tips/${reviewing.id}/review`} onClose={() => setReviewing(null)} /> : null}
    </div>
  );
}

export function AdminReports() {
  const inv = useInvalidate();
  const q = useQuery({ queryKey: ['admin', 'reports'], queryFn: () => api<{ items: { id: string; reason: string; details: string; status: string; resolutionNote: string | null; createdAt: string; pharmacy: { id: string; name: string; code: string } }[] }>('/admin/reports') });
  const [note, setNote] = useState<Record<string, string>>({});
  const resolve = useMutation({ mutationFn: (v: { id: string; status: string }) => post(`/admin/reports/${v.id}/resolve`, { status: v.status, note: note[v.id] ?? '' }), onSuccess: inv });
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Reports" subtitle="Reports of inaccurate stock, prices or suspicious pharmacies." />
      <QueryView query={q}>
        {(d) =>
          d.items.length === 0 ? (
            <EmptyState icon={Flag} title="No reports" />
          ) : (
            <ul className="grid gap-3">
              {d.items.map((r) => (
                <Card as="li" key={r.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold">
                      {r.pharmacy.name} <span className="font-mono text-xs text-muted">{r.pharmacy.code}</span>
                    </p>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="text-sm">
                    <Badge>{r.reason.replace('_', ' ')}</Badge> {r.details}
                  </p>
                  <p className="text-xs text-muted">{dateTime(r.createdAt)}{r.resolutionNote ? ` · ${r.resolutionNote}` : ''}</p>
                  {r.status === 'open' || r.status === 'investigating' ? (
                    <div className="mt-3 flex flex-wrap items-end gap-2">
                      <Field label="Note">{(id) => <Input id={id} value={note[r.id] ?? ''} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} className="w-72" />}</Field>
                      {['investigating', 'resolved', 'dismissed'].map((s) => (
                        <Button key={s} size="sm" variant="outline" disabled={(note[r.id] ?? '').trim().length < 3} onClick={() => resolve.mutate({ id: r.id, status: s })}>
                          {s}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </Card>
              ))}
            </ul>
          )
        }
      </QueryView>
    </div>
  );
}

export function AdminUsers() {
  const inv = useInvalidate();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const q = useQuery({ queryKey: ['admin', 'users', search], queryFn: () => api<{ items: { id: string; displayName: string | null; phone: string | null; email: string | null; roles: string[]; createdVia: string; isDemo: boolean; trialEndsAt: string | null; premiumUntil: string | null }[] }>(`/admin/users${search ? `?q=${encodeURIComponent(search)}` : ''}`) });
  const role = useMutation({
    mutationFn: (v: { id: string; role: string; grant: boolean }) => post(`/admin/users/${v.id}/roles`, { role: v.role, grant: v.grant }),
    onSuccess: () => {
      toast('Role updated (audited).');
      inv();
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Users & roles" subtitle="Phone numbers are masked. Role changes are recorded in the audit log." />
      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or number" aria-label="Search users" className="mb-4 max-w-sm" />
      <QueryView query={q}>
        {(d) => (
          <ul className="grid gap-2">
            {d.items.map((u) => (
              <Card as="li" key={u.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold">
                      {u.displayName ?? 'No name'} <span className="font-mono text-xs text-muted">{u.phone ?? u.email ?? ''}</span>
                    </p>
                    <p className="text-xs text-muted">
                      via {u.createdVia} · trial ends {u.trialEndsAt ? dateTime(u.trialEndsAt) : 'n/a'}
                      {u.premiumUntil ? ` · premium until ${dateTime(u.premiumUntil)}` : ''}
                    </p>
                  </div>
                  {u.isDemo ? <DemoTag /> : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {ROLES.map((r) => (
                    <Chip key={r} active={u.roles.includes(r)} onClick={() => role.mutate({ id: u.id, role: r, grant: !u.roles.includes(r) })}>
                      {r}
                    </Chip>
                  ))}
                </div>
              </Card>
            ))}
          </ul>
        )}
      </QueryView>
    </div>
  );
}

interface Settings {
  trialDays: number;
  premiumFeatures: string[];
  premiumPriceXaf: number;
  premiumPeriodDays: number;
  medicineSafetyNotice: string;
  healthDisclaimer: string;
}

export function AdminSettings() {
  const inv = useInvalidate();
  const toast = useToast();
  const q = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => api<Settings>('/admin/settings') });
  const [s, setS] = useState<Settings | null>(null);
  useEffect(() => {
    if (q.data) setS(q.data);
  }, [q.data]);
  const save = useMutation({
    mutationFn: () => put('/admin/settings', s),
    onSuccess: () => {
      toast('Settings saved (audited). The trial length applies to new accounts.');
      inv();
    },
  });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Trial & settings" />
      {s ? (
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Card className="grid gap-4 p-5 sm:grid-cols-3">
            <Field label="Trial length (days)">{(id) => <Input id={id} type="number" min={0} max={365} value={s.trialDays} onChange={(e) => setS({ ...s, trialDays: Number(e.target.value) })} />}</Field>
            <Field label="Premium price (FCFA)">{(id) => <Input id={id} type="number" min={100} value={s.premiumPriceXaf} onChange={(e) => setS({ ...s, premiumPriceXaf: Number(e.target.value) })} />}</Field>
            <Field label="Premium period (days)">{(id) => <Input id={id} type="number" min={1} max={366} value={s.premiumPeriodDays} onChange={(e) => setS({ ...s, premiumPeriodDays: Number(e.target.value) })} />}</Field>
          </Card>
          <Card className="p-5">
            <SectionTitle>Premium features</SectionTitle>
            <p className="text-sm text-muted">Pharmacy finder, price comparison, medicine information and pharmacy contact are always free.</p>
            {PREMIUM_FEATURES.map((f) => (
              <Toggle key={f} checked={s.premiumFeatures.includes(f)} onChange={(on) => setS({ ...s, premiumFeatures: on ? [...s.premiumFeatures, f] : s.premiumFeatures.filter((x) => x !== f) })} label={f} description={s.premiumFeatures.includes(f) ? 'Requires trial or Premium' : 'Free for everyone'} />
            ))}
          </Card>
          <Card className="grid gap-4 p-5">
            <Field label="Medicine safety notice (draft pending clinical/legal review)">{(id) => <Textarea id={id} rows={3} value={s.medicineSafetyNotice} onChange={(e) => setS({ ...s, medicineSafetyNotice: e.target.value })} />}</Field>
            <Field label="Health disclaimer (draft)">{(id) => <Textarea id={id} rows={3} value={s.healthDisclaimer} onChange={(e) => setS({ ...s, healthDisclaimer: e.target.value })} />}</Field>
          </Card>
          {save.isError ? <Notice tone="danger">{errorMessage(save.error)}</Notice> : null}
          <Button type="submit" loading={save.isPending} className="justify-self-start">
            Save settings
          </Button>
        </form>
      ) : (
        <QueryView query={q}>{() => null}</QueryView>
      )}
    </div>
  );
}

export function AdminLogs() {
  const [tab, setTab] = useState<'sms' | 'ussd'>('sms');
  const sms = useQuery({ queryKey: ['admin', 'sms'], queryFn: () => api<{ items: { id: string; direction: string; phone: string; command: string | null; status: string; provider: string; segments: number; encoding: string; body: string | null; createdAt: string }[] }>('/admin/sms-logs'), enabled: tab === 'sms' });
  const ussd = useQuery({ queryKey: ['admin', 'ussd'], queryFn: () => api<{ items: { sessionId: string; phone: string; screen: string | null; ended: boolean; lastActiveAt: string }[] }>('/admin/ussd-sessions'), enabled: tab === 'ussd' });
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="SMS & USSD logs" subtitle="Metadata is kept; message text is deleted after 7 days." />
      <Tabs label="Channel" value={tab} onChange={setTab} items={[{ value: 'sms', label: 'SMS' }, { value: 'ussd', label: 'USSD sessions' }]} />
      <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-white">
        {tab === 'sms' ? (
          <QueryView query={sms}>
            {(d) => (
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-slate-50 text-left text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2">When</th>
                    <th className="px-3 py-2">Dir</th>
                    <th className="px-3 py-2">Number</th>
                    <th className="px-3 py-2">Command</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Seg</th>
                    <th className="px-3 py-2">Text</th>
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((m) => (
                    <tr key={m.id} className="border-t border-border align-top">
                      <td className="whitespace-nowrap px-3 py-2">{dateTime(m.createdAt)}</td>
                      <td className="px-3 py-2">{m.direction}</td>
                      <td className="px-3 py-2 font-mono text-xs">{m.phone}</td>
                      <td className="px-3 py-2 font-mono text-xs">{m.command}</td>
                      <td className="px-3 py-2">
                        <Badge tone={m.status === 'simulated' ? 'amber' : m.status === 'failed' ? 'red' : 'neutral'}>{m.status}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        {m.segments} {m.encoding === 'UCS-2' ? 'U' : ''}
                      </td>
                      <td className="max-w-xs px-3 py-2 text-xs">{m.body ?? <em className="text-muted">deleted</em>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </QueryView>
        ) : (
          <QueryView query={ussd}>
            {(d) => (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2">Last active</th>
                    <th className="px-3 py-2">Session</th>
                    <th className="px-3 py-2">Number</th>
                    <th className="px-3 py-2">Screen</th>
                    <th className="px-3 py-2">Ended</th>
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((s) => (
                    <tr key={s.sessionId} className="border-t border-border">
                      <td className="px-3 py-2">{dateTime(s.lastActiveAt)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{s.sessionId}</td>
                      <td className="px-3 py-2 font-mono text-xs">{s.phone}</td>
                      <td className="px-3 py-2 font-mono text-xs">{s.screen}</td>
                      <td className="px-3 py-2">{s.ended ? 'yes' : 'no'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </QueryView>
        )}
      </div>
    </div>
  );
}

export function AdminAudit() {
  const [action, setAction] = useState('');
  const q = useQuery({ queryKey: ['admin', 'audit', action], queryFn: () => api<{ items: { id: string; actorId: string | null; action: string; targetType: string; targetId: string | null; detail: unknown; createdAt: string }[] }>(`/admin/audit${action ? `?action=${encodeURIComponent(action)}` : ''}`) });
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Audit log" subtitle="Append-only: the database rejects edits and deletions of these entries." />
      <Input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Filter by action prefix, e.g. pharmacy. or consent." aria-label="Filter audit actions" className="mb-4 max-w-sm" />
      <QueryView query={q}>
        {(d) => (
          <ul className="grid gap-1.5 text-sm">
            {d.items.map((a) => (
              <li key={a.id} className="rounded-xl border border-border bg-white px-3 py-2">
                <span className="font-mono text-xs text-muted">{dateTime(a.createdAt)}</span> <strong>{a.action}</strong> · {a.targetType} <span className="font-mono text-xs text-muted">{a.targetId?.slice(0, 8)}</span> · actor <span className="font-mono text-xs">{a.actorId?.slice(0, 8) ?? 'system'}</span>
                {a.detail ? <span className="block truncate font-mono text-[11px] text-muted">{JSON.stringify(a.detail)}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </div>
  );
}
