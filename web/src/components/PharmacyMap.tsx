import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { PharmacyPublic } from '../lib/types';

/**
 * Lazy-loaded OpenStreetMap view (no paid API). The list view stays fully usable when tiles or
 * geolocation are unavailable; tile failures are reported inline.
 */
const pin = L.divIcon({
  className: '',
  html: '<svg width="30" height="38" viewBox="0 0 24 30" aria-hidden="true"><path fill="#0B6FD0" d="M12 1a9 9 0 0 0-9 9c0 6.6 9 18 9 18s9-11.4 9-18a9 9 0 0 0-9-9z"/><circle cx="12" cy="10" r="4" fill="#fff"/><path d="M10 10h4M12 8v4" stroke="#1A7F37" stroke-width="1.6"/></svg>',
  iconSize: [30, 38],
  iconAnchor: [15, 37],
  popupAnchor: [0, -32],
});

export default function PharmacyMap({ pharmacies, onSelect }: { pharmacies: PharmacyPublic[]; onSelect?: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tileError, setTileError] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const located = pharmacies.filter((p) => p.lat !== null && p.lng !== null);
    const map = L.map(ref.current, { scrollWheelZoom: false }).setView([4.152, 9.272], 13);
    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    tiles.on('tileerror', () => setTileError(true));
    for (const p of located) {
      const m = L.marker([p.lat!, p.lng!], { icon: pin, title: p.name, keyboard: true }).addTo(map);
      const el = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = p.name;
      const area = document.createElement('div');
      area.textContent = `${p.area}, ${p.town}`;
      el.append(strong, area);
      m.bindPopup(el);
      m.on('click', () => onSelect?.(p.id));
    }
    if (located.length > 1) map.fitBounds(L.latLngBounds(located.map((p) => [p.lat!, p.lng!])), { padding: [32, 32] });
    return () => {
      map.remove();
    };
  }, [pharmacies, onSelect]);
  return (
    <div>
      <div ref={ref} className="h-[360px] w-full overflow-hidden rounded-2xl border border-border" role="region" aria-label="Map of pharmacies" />
      {tileError ? <p className="mt-2 text-xs text-warning">Map tiles could not load. The list view has the same information.</p> : null}
    </div>
  );
}
