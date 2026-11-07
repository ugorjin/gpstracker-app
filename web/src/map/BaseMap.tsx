import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { ReactNode } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';

const TILE_URL = import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  import.meta.env.VITE_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Lagos, used until there's something to show. */
export const DEFAULT_CENTER: L.LatLngExpression = [6.5244, 3.3792];

export function BaseMap({ children, center = DEFAULT_CENTER, zoom = 11 }: { children?: ReactNode; center?: L.LatLngExpression; zoom?: number }) {
  return (
    <MapContainer center={center} zoom={zoom} zoomControl={false} preferCanvas>
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
      {children}
    </MapContainer>
  );
}

const ARROW =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l7 19-7-4-7 4 7-19z"/></svg>';
const DOT = '<svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><circle cx="4" cy="4" r="4" fill="currentColor"/></svg>';

const iconCache = new Map<string, L.DivIcon>();

/** Round marker coloured by status; shows a heading arrow when moving. */
export function vehicleIcon(status: string, course: number | null, selected: boolean): L.DivIcon {
  const moving = status === 'moving' && course !== null;
  const rot = moving ? Math.round((course ?? 0) / 10) * 10 : 0;
  const key = `${status}|${rot}|${moving}|${selected}`;
  let icon = iconCache.get(key);
  if (!icon) {
    icon = L.divIcon({
      className: '',
      html: `<div class="vmarker" data-status="${status}" data-selected="${selected}"><div class="dot" style="transform: rotate(${rot}deg)">${moving ? ARROW : DOT}</div></div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
    iconCache.set(key, icon);
  }
  return icon;
}
