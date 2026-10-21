import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, ExternalLink, Search, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Card, DemoTag, EmptyState, Input, LinkButton, Notice, QueryView, StatusBadge } from '../../components/ui';
import { api } from '../../lib/api';

interface MedicineSummary {
  id: string;
  label: string;
  name: string;
  genericName: string;
  strength: string;
  form: string;
  infoStatus: string;
  isDemo: boolean;
}
interface MedicineDetail extends MedicineSummary {
  safetyNotice: string;
  information: null | {
    indications: string | null;
    usageNotes: string | null;
    warnings: string | null;
    interactions: string | null;
    storage: string | null;
    sideEffects: string | null;
    source: { authority: string | null; url: string | null; versionDate: string | null };
    reviewedBy: string | null;
    verifiedAt: string | null;
  };
}

export function MedicinesPage() {
  const [q, setQ] = useState('');
  const query = useQuery({ queryKey: ['medicines', q], queryFn: () => api<{ items: MedicineSummary[] }>(`/medicines${q ? `?q=${encodeURIComponent(q)}` : ''}`) });
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold sm:text-3xl">Medicine information</h1>
      <p className="mt-1 text-sm text-muted">Information is shown only after a reviewer has checked it against a recorded source. Otherwise we say so plainly.</p>
      <div className="relative mt-5">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <label htmlFor="med-q" className="sr-only">Search medicines</label>
        <Input id="med-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, e.g. amoxicillin" className="pl-10" />
      </div>
      <div className="mt-5">
        <QueryView query={query}>
          {(d) =>
            d.items.length === 0 ? (
              <EmptyState icon={BookOpen} title="No medicine found">
                Try the generic name.
              </EmptyState>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {d.items.map((m) => (
                  <Card as="li" key={m.id} className="p-4">
                    <Link to={`/medicines/${m.id}`} className="font-semibold text-ink hover:text-primary-700 hover:underline">
                      {m.label}
                    </Link>
                    <p className="text-xs text-muted">Generic: {m.genericName}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <StatusBadge status={m.infoStatus} />
                      {m.isDemo ? <DemoTag /> : null}
                    </div>
                  </Card>
                ))}
              </ul>
            )
          }
        </QueryView>
      </div>
    </div>
  );
}

export function MedicineDetailPage() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['medicine', id], queryFn: () => api<MedicineDetail>(`/medicines/${id}`) });
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link to="/medicines" className="text-sm font-semibold text-primary-700 hover:underline">
        ← All medicines
      </Link>
      <QueryView query={q}>
        {(m) => (
          <article className="mt-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={m.infoStatus} />
              {m.isDemo ? <DemoTag /> : null}
            </div>
            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{m.label}</h1>
            <p className="text-muted">Generic name: {m.genericName}</p>
            <div className="mt-5">
              <Notice tone="warning" icon={ShieldAlert} title="Safety notice">
                {m.safetyNotice}
              </Notice>
            </div>
            {m.information ? (
              <div className="mt-6 grid gap-4">
                {(
                  [
                    ['What it is used for (from the source)', m.information.indications],
                    ['General usage notes', m.information.usageNotes],
                    ['Warnings', m.information.warnings],
                    ['Interactions', m.information.interactions],
                    ['Storage', m.information.storage],
                    ['Common side effects', m.information.sideEffects],
                  ] as const
                )
                  .filter(([, v]) => v)
                  .map(([title, v]) => (
                    <Card key={title} className="p-4">
                      <h2 className="font-bold">{title}</h2>
                      <p className="mt-1 whitespace-pre-line text-sm text-ink">{v}</p>
                    </Card>
                  ))}
                <Card className="bg-secondary-50 p-4 text-sm">
                  <p className="flex items-center gap-2 font-semibold text-secondary-700">
                    <ShieldCheck className="size-4" aria-hidden /> Reviewed information
                  </p>
                  <dl className="mt-2 grid gap-1 text-ink">
                    <div>
                      <dt className="inline text-muted">Source: </dt>
                      <dd className="inline">
                        {m.information.source.authority}
                        {m.information.source.url ? (
                          <>
                            {' '}
                            <a href={m.information.source.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 font-semibold text-primary-700 underline">
                              link <ExternalLink className="size-3" aria-hidden />
                            </a>
                          </>
                        ) : null}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline text-muted">Source version: </dt>
                      <dd className="inline">{m.information.source.versionDate}</dd>
                    </div>
                    <div>
                      <dt className="inline text-muted">Reviewed by: </dt>
                      <dd className="inline">
                        {m.information.reviewedBy} on {m.information.verifiedAt?.slice(0, 10)}
                      </dd>
                    </div>
                  </dl>
                </Card>
              </div>
            ) : (
              <div className="mt-6">
                <EmptyState icon={BookOpen} title="Reviewed information is not available yet">
                  We only publish medicine information after a qualified reviewer has checked it against an authoritative source. Please ask a pharmacist or health worker.
                </EmptyState>
              </div>
            )}
            <div className="mt-6">
              <LinkButton to={`/find?q=${encodeURIComponent(`${m.name} ${m.strength}`.trim())}`} icon={Search}>
                Find pharmacies that reported it
              </LinkButton>
            </div>
          </article>
        )}
      </QueryView>
    </div>
  );
}
