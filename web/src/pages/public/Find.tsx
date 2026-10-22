import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Clock, Crosshair, Map as MapIcon, MapPin, Phone, Search, Tag } from 'lucide-react';
import { Badge, Button, Chip, EmptyState, Input, List, ListItem, ListRow, Notice, QueryView, Skeleton, StockBadge, Tabs } from '../../components/ui';
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

function OfferRow({ o }: { o: Offer }) {
  return (
    <ListItem>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/pharmacies/${o.pharmacy.id}`} className="font-bold text-ink hover:text-primary-700 hover:underline">
            {o.pharmacy.name}
          </Link>
          <p className="text-sm text-muted">
            {o.pharmacy.area}, {o.pharmacy.town}
            {o.pharmacy.distanceKm != null ? ` · ${o.pharmacy.distanceKm} km` : ''}
            {o.pharmacy.isDemo ? ' · fictional' : ''}
          </p>
        </div>
        <p className="shrink-0 text-lg font-bold text-ink">{money(o.price, o.currency)}</p>
      </div>
      <p className="mt-1.5 text-sm font-semibold text-ink">{o.medicine.label}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <StockBadge state={o.stockState} stale={o.stale} />
        <OpenBadge open={o.pharmacy.openNow} />
        {o.lowest ? (
          <Badge tone="blue" icon={Tag}>
            Lowest listed price
          </Badge>
        ) : null}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-xs text-muted">
          Reported {o.ageLabel} · {new Date(o.updatedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
        </p>
        <a href={`tel:${o.pharmacy.phone}`} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-semibold text-primary-700 hover:bg-primary-50">
          <Phone className="size-4" aria-hidden /> Call
        </a>
      </div>
    </ListItem>
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
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      <h1 className="text-2xl font-bold text-ink sm:text-3xl">Find a pharmacy</h1>
      <p className="mt-1 text-sm text-muted">
        Only pharmacies checked by a MEDIMATE admin appear. Stock and prices are what each pharmacy <strong>last reported</strong>, so call before you travel.
      </p>

      <form
        role="search"
        className="mt-5 grid gap-2 sm:grid-cols-[1.3fr_1fr_auto]"
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
        <label htmlFor="find-q" className="sr-only">
          Medicine name
        </label>
        <Input id="find-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Medicine, e.g. paracetamol 500" />
        <label htmlFor="find-area" className="sr-only">
          Area or town
        </label>
        <Input id="find-area" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area or town (optional)" />
        <Button type="submit" icon={Search}>
          Search
        </Button>
      </form>

      <div className="scrollbar-none -mx-4 mt-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Sort results">
        <Chip active={sort === 'freshness'} onClick={() => set('sort', null)}>
          Most recent
        </Chip>
        <Chip active={sort === 'price'} onClick={() => set('sort', 'price')}>
          Lowest price
        </Chip>
        <Chip active={sort === 'distance'} onClick={() => (geo ? set('sort', 'distance') : locate())} icon={Crosshair}>
          Nearest
        </Chip>
        <Chip active={openNow} onClick={() => set('openNow', openNow ? null : 'true')}>
          Open now
        </Chip>
        <Chip active={includeStale} onClick={() => set('includeStale', includeStale ? null : 'true')}>
          Include older reports
        </Chip>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex items-center gap-2 whitespace-nowrap text-sm text-muted">
          Max price
          <Input type="number" min={0} inputMode="numeric" placeholder="FCFA" aria-label="Maximum price in FCFA" className="!min-h-10 w-24" value={maxPrice} onChange={(e) => set('maxPrice', e.target.value || null)} />
        </label>
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
      {geoMsg ? <p className="mt-2 text-xs text-muted">{geoMsg}</p> : null}

      <div className="mt-5">
        {view === 'map' ? (
          <div className="mb-4">
            <Suspense fallback={<Skeleton className="h-[320px]" />}>
              <PharmacyMap pharmacies={mapPharmacies} />
            </Suspense>
          </div>
        ) : null}

        {hasQuery ? (
          <QueryView query={search}>
            {(data) =>
              data.unknownMedicine ? (
                <EmptyState icon={Search} title="We could not find that medicine">
                  Check the spelling, or search by generic name.{' '}
                  <Link className="font-semibold text-primary-700 underline" to="/medicines">
                    Browse the medicine list
                  </Link>
                  .
                </EmptyState>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted" aria-live="polite">
                    {data.total} result{data.total === 1 ? '' : 's'} for {data.medicines.map((m) => m.label).join(', ')}
                    {data.staleHidden ? ` · ${data.staleHidden} older report${data.staleHidden === 1 ? '' : 's'} hidden` : ''}
                  </p>
                  {data.items.length === 0 ? (
                    <EmptyState icon={MapIcon} title="No recent reports match">
                      No verified pharmacy has reported this medicine recently{params.get('area') ? ' in this area' : ''}. Try another area, include older reports, or ask a pharmacy directly.
                    </EmptyState>
                  ) : (
                    <List label="Pharmacies that reported this medicine">
                      {data.items.map((o) => (
                        <OfferRow key={o.stockId} o={o} />
                      ))}
                    </List>
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
              <>
                <p className="mb-3 text-sm text-muted">
                  {data.items.length} verified pharmac{data.items.length === 1 ? 'y' : 'ies'}. Search a medicine to see reported stock and prices.
                </p>
                {data.items.length === 0 ? (
                  <EmptyState icon={MapPin} title="No verified pharmacies in this area yet" />
                ) : (
                  <List label="Verified pharmacies">
                    {data.items.map((p) => (
                      <ListRow
                        key={p.id}
                        to={`/pharmacies/${p.id}`}
                        icon={MapPin}
                        title={p.name}
                        detail={`${p.area}, ${p.town} · ${p.openNow === null ? 'hours not listed' : p.openNow ? 'open now' : 'closed now'}${p.isDemo ? ' · fictional' : ''}`}
                      />
                    ))}
                  </List>
                )}
              </>
            )}
          </QueryView>
        )}
      </div>
    </div>
  );
}
