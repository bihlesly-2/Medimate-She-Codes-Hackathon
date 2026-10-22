import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Car, Clock, Footprints, LocateFixed, Map as MapIcon, Navigation, Phone, Search, Tag, X } from 'lucide-react';
import { Badge, Button, Chip, EmptyState, Input, Notice, QueryView, Skeleton, StockBadge, Tabs, cx } from '../../components/ui';
import { api } from '../../lib/api';
import { money } from '../../lib/format';
import type { Offer, PharmacyPublic, SearchResult } from '../../lib/types';

const PharmacyMap = lazy(() => import('../../components/PharmacyMap'));

type Geo = { lat: number; lng: number };
type GeoState = 'idle' | 'asking' | 'on' | 'denied' | 'unavailable';

/**
 * Rough travel times from straight-line distance (roads add about 30%). Shown as "about", never exact:
 * walking at 4.8 km/h, a taxi or moto in town at about 20 km/h plus a short wait.
 */
function travel(km: number) {
  const road = km * 1.3;
  return { walk: Math.max(1, Math.round((road / 4.8) * 60)), ride: Math.max(2, Math.round((road / 20) * 60) + 2) };
}

function directionsUrl(p: PharmacyPublic, mode: 'walking' | 'driving') {
  const dest = p.lat != null && p.lng != null ? `${p.lat},${p.lng}` : encodeURIComponent(`${p.address}, ${p.town}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=${mode}`;
}

const POPULAR = ['Paracetamol', 'Amoxicillin', 'ORS', 'Metformin', 'Ibuprofen'];

function useGeo(): [Geo | null, GeoState, () => void] {
  const [geo, setGeo] = useState<Geo | null>(null);
  const [state, setState] = useState<GeoState>('idle');
  const ask = () => {
    if (!('geolocation' in navigator)) return setState('unavailable');
    setState('asking');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setState('on');
      },
      (err) => setState(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  };
  // Ask automatically when the person already allowed location for this site.
  useEffect(() => {
    void navigator.permissions
      ?.query({ name: 'geolocation' as PermissionName })
      .then((p) => {
        if (p.state === 'granted') ask();
        if (p.state === 'denied') setState('denied');
      })
      .catch(() => undefined);
  }, []);
  return [geo, state, ask];
}

function OfferCard({ o, best }: { o: Offer; best?: boolean }) {
  const p = o.pharmacy;
  const t = p.distanceKm != null ? travel(p.distanceKm) : null;
  return (
    <li className={cx('card-3d rounded-[var(--radius-card)] bg-white p-4', best && 'border-secondary-400')}>
      {best ? (
        <span className="mb-2 inline-flex items-center gap-1 rounded-full bg-secondary-50 px-2.5 py-0.5 text-xs font-extrabold text-secondary-700">Best option for you</span>
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/pharmacies/${p.id}`} className="font-brand text-lg font-extrabold leading-tight text-ink hover:text-primary-700">
            {p.name}
          </Link>
          <p className="text-sm text-muted">
            {p.area}, {p.town}
          </p>
        </div>
        <p className="shrink-0 text-right">
          <span className="block font-brand text-xl font-extrabold text-ink">{money(o.price, o.currency)}</span>
          {o.lowest ? (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-primary-700">
              <Tag className="size-3.5" aria-hidden /> Lowest price
            </span>
          ) : null}
        </p>
      </div>

      {t ? (
        <div className="mt-3 grid grid-cols-3 gap-2 rounded-2xl bg-sky p-2 text-center">
          <span>
            <span className="block font-brand text-lg font-extrabold text-primary-700">{p.distanceKm} km</span>
            <span className="text-[11px] font-bold text-muted">away</span>
          </span>
          <span>
            <span className="flex items-center justify-center gap-1 font-brand text-lg font-extrabold text-ink">
              <Car className="size-4" aria-hidden /> {t.ride}′
            </span>
            <span className="text-[11px] font-bold text-muted">by taxi</span>
          </span>
          <span>
            <span className="flex items-center justify-center gap-1 font-brand text-lg font-extrabold text-ink">
              <Footprints className="size-4" aria-hidden /> {t.walk}′
            </span>
            <span className="text-[11px] font-bold text-muted">walking</span>
          </span>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <StockBadge state={o.stockState} stale={o.stale} />
        <Badge tone={p.openNow ? 'green' : 'neutral'} icon={Clock}>
          {p.openNow === null ? 'Hours not listed' : p.openNow ? 'Open now' : 'Closed now'}
        </Badge>
        <span className="text-xs text-muted">{o.medicine.label} · reported {o.ageLabel}</span>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
        <a href={directionsUrl(p, t && t.walk <= 20 ? 'walking' : 'driving')} target="_blank" rel="noreferrer noopener" className="btn-3d inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-secondary-600 font-brand font-extrabold text-white [--edge:#0e4f22]">
          <Navigation className="size-5" aria-hidden /> Directions
        </a>
        <a href={`tel:${p.phone}`} className="btn-3d inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 border-border bg-white px-4 font-brand font-extrabold text-primary-700 [--edge:var(--color-border)]" aria-label={`Call ${p.name}`}>
          <Phone className="size-5" aria-hidden /> Call
        </a>
      </div>
    </li>
  );
}

export default function Find() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [focused, setFocused] = useState(false);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [geo, geoState, askGeo] = useGeo();
  const active = params.get('q') ?? '';
  const sort = (params.get('sort') as 'price' | 'distance' | null) ?? (geo ? 'distance' : 'price');

  const query = new URLSearchParams({ q: active, sort, includeStale: 'false' });
  if (geo) {
    query.set('lat', String(geo.lat));
    query.set('lng', String(geo.lng));
  }
  const search = useQuery({ queryKey: ['search', query.toString()], queryFn: () => api<SearchResult>(`/pharmacies/search?${query}`), enabled: Boolean(active) });
  const suggestions = useQuery({
    queryKey: ['medicines', q.trim()],
    queryFn: () => api<{ items: { id: string; label: string; name: string; strength: string }[] }>(`/medicines?q=${encodeURIComponent(q.trim())}`),
    enabled: focused && q.trim().length >= 2,
    staleTime: 60_000,
  });
  const nearby = useQuery({ queryKey: ['pharmacies', ''], queryFn: () => api<{ items: PharmacyPublic[] }>('/pharmacies'), enabled: !active });

  const run = (term: string) => {
    const t = term.trim();
    setQ(t);
    setFocused(false);
    if (!geo && geoState === 'idle') askGeo();
    const next = new URLSearchParams(params);
    if (t) next.set('q', t);
    else next.delete('q');
    setParams(next);
  };
  const setSort = (s: 'price' | 'distance') => {
    if (s === 'distance' && !geo) askGeo();
    const next = new URLSearchParams(params);
    next.set('sort', s);
    setParams(next, { replace: true });
  };

  const mapPharmacies = useMemo(() => {
    if (active) {
      const seen = new Map<string, PharmacyPublic>();
      for (const o of search.data?.items ?? []) seen.set(o.pharmacy.id, o.pharmacy);
      return [...seen.values()];
    }
    return nearby.data?.items ?? [];
  }, [active, search.data, nearby.data]);

  const items = search.data?.items ?? [];
  const available = items.filter((o) => o.stockState === 'in_stock' || o.stockState === 'low');
  const best = available.length ? [...available].sort((a, b) => (a.pharmacy.distanceKm ?? 99) - (b.pharmacy.distanceKm ?? 99) || (a.price ?? 1e9) - (b.price ?? 1e9))[0] : undefined;
  const rest = items.filter((o) => o !== best);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <button
        type="button"
        onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))}
        className="-ml-2 mb-2 inline-flex min-h-11 items-center gap-1 rounded-xl px-2 font-brand font-extrabold text-primary-700 hover:bg-primary-50"
      >
        <ArrowLeft className="size-5" aria-hidden /> Back
      </button>
      <h1 className="text-[28px] leading-tight">Find your medicine</h1>
      <p className="mt-1 text-sm text-muted">Type the medicine. We show verified pharmacies that have it, the price, and how to get there.</p>

      <form
        role="search"
        className="relative mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(q);
        }}
      >
        <label htmlFor="find-q" className="sr-only">
          Medicine name
        </label>
        <Search className="pointer-events-none absolute left-4 top-[26px] size-5 -translate-y-1/2 text-muted" aria-hidden />
        <Input
          id="find-q"
          value={q}
          autoComplete="off"
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. paracetamol"
          className="!min-h-[52px] rounded-2xl border-2 pl-12 pr-24 text-[17px]"
        />
        {q ? (
          <button type="button" onClick={() => setQ('')} className="absolute right-[76px] top-[26px] grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-slate-100" aria-label="Clear">
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
        <Button type="submit" size="sm" className="absolute right-1.5 top-[26px] -translate-y-1/2">
          Go
        </Button>
        {focused && suggestions.data?.items.length ? (
          <ul className="card-3d absolute inset-x-0 top-[58px] z-20 overflow-hidden rounded-2xl bg-white" role="listbox" aria-label="Suggestions">
            {suggestions.data.items.slice(0, 6).map((m) => (
              <li key={m.id}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => run(`${m.name} ${m.strength}`.trim())} className="flex min-h-12 w-full items-center gap-3 px-4 text-left hover:bg-sky">
                  <Search className="size-4 text-muted" aria-hidden />
                  <span className="font-semibold text-ink">{m.label}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </form>

      {/* Location status */}
      <div className="mt-3">
        {geoState === 'on' ? (
          <p className="inline-flex items-center gap-1.5 text-sm font-bold text-secondary-700">
            <LocateFixed className="size-4" aria-hidden /> Using your location for distance and time. It is not stored.
          </p>
        ) : geoState === 'asking' ? (
          <p className="text-sm text-muted">Finding your location…</p>
        ) : geoState === 'denied' ? (
          <p className="text-sm text-muted">Location is blocked, so results are sorted by price. Allow location for this site to see distances.</p>
        ) : geoState === 'unavailable' ? (
          <p className="text-sm text-muted">We could not get your location. Results still work, sorted by price.</p>
        ) : (
          <button type="button" onClick={askGeo} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border-2 border-b-4 border-border bg-white px-3 text-sm font-bold text-primary-700">
            <LocateFixed className="size-4" aria-hidden /> Use my location for distances
          </button>
        )}
      </div>

      {!active ? (
        <>
          <h2 className="mb-2 mt-6 text-lg">Popular searches</h2>
          <div className="flex flex-wrap gap-2">
            {POPULAR.map((m) => (
              <Chip key={m} onClick={() => run(m)}>
                {m}
              </Chip>
            ))}
          </div>
          <h2 className="mb-2 mt-7 text-lg">Verified pharmacies</h2>
          {nearby.isPending ? (
            <Skeleton className="h-40" />
          ) : (
            <ul className="grid gap-3">
              {(nearby.data?.items ?? []).map((p) => (
                <li key={p.id} className="card-3d flex items-center justify-between gap-3 rounded-2xl bg-white p-4">
                  <Link to={`/pharmacies/${p.id}`} className="min-w-0">
                    <span className="block font-brand font-extrabold text-ink">{p.name}</span>
                    <span className="block text-sm text-muted">
                      {p.area} · {p.openNow === null ? 'hours not listed' : p.openNow ? 'open now' : 'closed now'}
                    </span>
                  </Link>
                  <a href={directionsUrl(p, 'driving')} target="_blank" rel="noreferrer noopener" className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary-50 text-secondary-700" aria-label={`Directions to ${p.name}`}>
                    <Navigation className="size-5" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="mt-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex gap-2" role="group" aria-label="Sort">
              <Chip active={sort === 'distance'} onClick={() => setSort('distance')}>
                Nearest
              </Chip>
              <Chip active={sort === 'price'} onClick={() => setSort('price')}>
                Cheapest
              </Chip>
            </div>
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
          {view === 'map' ? (
            <div className="mb-4">
              <Suspense fallback={<Skeleton className="h-[320px]" />}>
                <PharmacyMap pharmacies={mapPharmacies} />
              </Suspense>
            </div>
          ) : null}
          <QueryView query={search}>
            {(data) =>
              data.unknownMedicine ? (
                <EmptyState icon={Search} title="We don’t know that medicine yet">
                  Check the spelling, or try the generic name (for example paracetamol instead of a brand).
                </EmptyState>
              ) : items.length === 0 ? (
                <EmptyState icon={MapIcon} title="No pharmacy reported it recently">
                  No verified pharmacy reported this medicine in the last 48 hours. Call a pharmacy directly, or try another medicine.
                </EmptyState>
              ) : (
                <>
                  <p className="mb-3 text-sm text-muted" aria-live="polite">
                    {data.total} pharmac{data.total === 1 ? 'y has' : 'ies have'} {data.medicines.map((m) => m.label).join(', ')}
                  </p>
                  <ul className="grid gap-4">
                    {best ? <OfferCard o={best} best /> : null}
                    {rest.map((o) => (
                      <OfferCard key={o.stockId} o={o} />
                    ))}
                  </ul>
                  <div className="mt-4">
                    <Notice>Prices and stock are what each pharmacy last reported. Times are estimates. Call before you go.</Notice>
                  </div>
                </>
              )
            }
          </QueryView>
        </div>
      )}
    </div>
  );
}
