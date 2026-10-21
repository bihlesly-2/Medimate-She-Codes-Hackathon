import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownWideNarrow, Clock, Crosshair, List, Map as MapIcon, Phone, Search, Tag } from 'lucide-react';
import { MapPinIcon } from '../../components/brand';
import { Badge, Button, Card, Chip, DemoTag, EmptyState, Input, Notice, QueryView, Skeleton, StockBadge, Tabs } from '../../components/ui';
import { api } from '../../lib/api';
import { money } from '../../lib/format';
import type { Offer, PharmacyPublic, SearchResult } from '../../lib/types';

const PharmacyMap = lazy(() => import('../../components/PharmacyMap'));

function OpenBadge({ open }: { open: boolean | null }) {
  if (open === null) return <Badge icon={Clock}>Hours not listed</Badge>;
  return open ? (
    <Badge tone="green" icon={Clock}>
      Open now
    </Badge>
  ) : (
    <Badge tone="neutral" icon={Clock}>
      Closed now
    </Badge>
  );
}

function OfferCard({ o }: { o: Offer }) {
  return (
    <Card as="li" className="p-4">
      <div className="flex gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-600">
          <MapPinIcon className="size-7" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/pharmacies/${o.pharmacy.id}`} className="font-bold text-ink hover:text-primary-700 hover:underline">
              {o.pharmacy.name}
            </Link>
            {o.pharmacy.isDemo ? <DemoTag /> : null}
          </div>
          <p className="text-sm text-muted">
            {o.pharmacy.area}, {o.pharmacy.town} · code <span className="font-mono font-semibold">{o.pharmacy.code}</span>
            {o.pharmacy.distanceKm != null ? ` · ${o.pharmacy.distanceKm} km away` : ''}
          </p>
          <p className="mt-2 text-sm font-semibold text-ink">{o.medicine.label}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StockBadge state={o.stockState} stale={o.stale} />
            <OpenBadge open={o.pharmacy.openNow} />
            {o.lowest ? (
              <Badge tone="blue" icon={Tag}>
                Lowest listed price
              </Badge>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-muted">Reported {o.ageLabel} · {new Date(o.updatedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end justify-between gap-2 text-right">
          <p className="text-lg font-extrabold text-ink">{money(o.price, o.currency)}</p>
          <a href={`tel:${o.pharmacy.phone}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-semibold text-primary-700 hover:bg-primary-50">
            <Phone className="size-4" aria-hidden /> Call
          </a>
        </div>
      </div>
    </Card>
  );
}

export default function Find() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [area, setArea] = useState(params.get('area') ?? '');
  const [view, setView] = useState<'list' | 'map'>('list');
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const sort = (params.get('sort') as 'price' | 'distance' | 'freshness') ?? 'freshness';
  const openNow = params.get('openNow') === 'true';
  const includeStale = params.get('includeStale') === 'true';
  const maxPrice = params.get('maxPrice') ?? '';

  const query = new URLSearchParams();
  for (const k of ['q', 'area', 'sort', 'openNow', 'includeStale', 'maxPrice']) {
    const v = params.get(k);
    if (v) query.set(k, v);
  }
  if (geo) {
    query.set('lat', String(geo.lat));
    query.set('lng', String(geo.lng));
  }
  const hasQuery = Boolean(params.get('q'));
  const search = useQuery({
    queryKey: ['search', query.toString()],
    queryFn: () => api<SearchResult>(`/pharmacies/search?${query}`),
    enabled: hasQuery,
  });
  const browse = useQuery({
    queryKey: ['pharmacies', params.get('area') ?? ''],
    queryFn: () => api<{ items: PharmacyPublic[] }>(`/pharmacies${params.get('area') ? `?area=${encodeURIComponent(params.get('area')!)}` : ''}`),
    enabled: !hasQuery,
  });

  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const mapPharmacies = useMemo(() => {
    if (hasQuery) {
      const seen = new Map<string, PharmacyPublic>();
      for (const o of search.data?.items ?? []) seen.set(o.pharmacy.id, o.pharmacy);
      return [...seen.values()];
    }
    return browse.data?.items ?? [];
  }, [hasQuery, search.data, browse.data]);

  const locate = () => {
    if (!('geolocation' in navigator)) return setGeoMsg('Location is not available on this device. You can still sort by price or freshness.');
    setGeoMsg('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoMsg('Using your current location for distances. It is not stored.');
        set('sort', 'distance');
      },
      () => setGeoMsg('We could not get your location. Results still work without it.'),
      { timeout: 8000 },
    );
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold text-ink sm:text-3xl">Find a pharmacy</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Only admin-verified pharmacies appear. Stock and prices are what each pharmacy <strong>last reported</strong>. Call to confirm before you travel.
      </p>

      <form
        role="search"
        className="mt-5 grid gap-2 rounded-2xl border border-border bg-white p-2  sm:grid-cols-[1.3fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          const next = new URLSearchParams(params);
          if (q.trim()) next.set('q', q.trim());
          else next.delete('q');
          if (area.trim()) next.set('area', area.trim());
          else next.delete('area');
          setParams(next);
        }}
      >
        <label htmlFor="find-q" className="sr-only">Medicine name</label>
        <Input id="find-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Medicine, e.g. paracetamol 500" />
        <label htmlFor="find-area" className="sr-only">Area or town</label>
        <Input id="find-area" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area or town (optional)" />
        <Button type="submit" icon={Search} size="lg">
          Search
        </Button>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-muted">
          <ArrowDownWideNarrow className="size-4" aria-hidden /> Sort
        </span>
        <Chip active={sort === 'freshness'} onClick={() => set('sort', null)}>
          Most recent
        </Chip>
        <Chip active={sort === 'price'} onClick={() => set('sort', 'price')}>
          Lowest price
        </Chip>
        <Chip active={sort === 'distance'} onClick={() => (geo ? set('sort', 'distance') : locate())} icon={Crosshair}>
          Nearest
        </Chip>
        <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
        <Chip active={openNow} onClick={() => set('openNow', openNow ? null : 'true')}>
          Open now
        </Chip>
        <Chip active={includeStale} onClick={() => set('includeStale', includeStale ? null : 'true')}>
          Include older reports
        </Chip>
        <label className="ml-1 inline-flex items-center gap-2 text-sm text-muted">
          Max price
          <Input
            type="number"
            min={0}
            inputMode="numeric"
            className="!min-h-10 w-28"
            value={maxPrice}
            onChange={(e) => set('maxPrice', e.target.value || null)}
            aria-label="Maximum price in FCFA"
          />
        </label>
        <div className="ml-auto">
          <Tabs
            label="View"
            value={view}
            onChange={setView}
            items={[
              { value: 'list', label: 'List' },
              { value: 'map', label: 'Map' },
            ]}
          />
        </div>
      </div>
      {geoMsg ? <p className="mt-2 text-xs text-muted">{geoMsg}</p> : null}

      <div className="mt-5">
        {view === 'map' ? (
          <Suspense fallback={<Skeleton className="h-[360px]" />}>
            <PharmacyMap pharmacies={mapPharmacies} />
          </Suspense>
        ) : null}

        {hasQuery ? (
          <QueryView query={search}>
            {(data) =>
              data.unknownMedicine ? (
                <EmptyState icon={Search} title="We could not find that medicine">
                  Check the spelling, or search by generic name. <Link className="font-semibold text-primary-700 underline" to="/medicines">Browse the medicine list</Link>.
                </EmptyState>
              ) : (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-muted" aria-live="polite">
                    {data.total} result{data.total === 1 ? '' : 's'} for {data.medicines.map((m) => m.label).join(', ')}
                    {data.staleHidden ? ` · ${data.staleHidden} older report${data.staleHidden === 1 ? '' : 's'} hidden` : ''}
                  </p>
                  {data.items.length === 0 ? (
                    <EmptyState icon={MapIcon} title="No recent reports match">
                      No verified pharmacy has reported this medicine recently{params.get('area') ? ' in this area' : ''}. Try another area, include older reports, or ask a pharmacy directly.
                    </EmptyState>
                  ) : (
                    <ul className="grid gap-3">
                      {data.items.map((o) => (
                        <OfferCard key={o.stockId} o={o} />
                      ))}
                    </ul>
                  )}
                  <Notice title="About price comparison">
                    “Lowest listed price” compares only the same medicine, strength and form, among reports from the last 48 hours that were in stock or low. Prices change, so confirm with the pharmacy.
                  </Notice>
                </div>
              )
            }
          </QueryView>
        ) : (
          <QueryView query={browse}>
            {(data) => (
              <div className="mt-4">
                <p className="mb-3 text-sm text-muted">
                  <List className="mr-1 inline size-4" aria-hidden />
                  {data.items.length} verified pharmac{data.items.length === 1 ? 'y' : 'ies'}. Search a medicine to see reported stock and prices.
                </p>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {data.items.map((p) => (
                    <Card as="li" key={p.id} className="p-4">
                      <div className="flex items-start gap-3">
                        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-600">
                          <MapPinIcon className="size-6" />
                        </span>
                        <div className="min-w-0">
                          <Link to={`/pharmacies/${p.id}`} className="font-bold text-ink hover:text-primary-700 hover:underline">
                            {p.name}
                          </Link>
                          <p className="text-sm text-muted">
                            {p.area}, {p.town}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {p.isDemo ? <DemoTag /> : null}
                            <OpenBadge open={p.openNow} />
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </ul>
              </div>
            )}
          </QueryView>
        )}
      </div>
    </div>
  );
}
