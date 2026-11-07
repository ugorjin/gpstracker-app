import type { DeviceKind } from '../api/types';

// Small inline icon set (Lucide-style strokes) so we don't ship an icon library.
const PATHS: Record<string, string> = {
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zm0 0v14m6-12v14',
  bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9m4.3 13a1.94 1.94 0 0 0 3.4 0',
  car: 'M5 17h14M6 17v2m12-2v2M3 13l2-6a2 2 0 0 1 2-1.4h10A2 2 0 0 1 19 7l2 6v4H3v-4zm0 0h18M7 14.5h.01M17 14.5h.01',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m14-18a4 4 0 0 1 0 7.75M22 21v-2a4 4 0 0 0-3-3.87M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  building: 'M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1',
  user: 'M20 21a8 8 0 1 0-16 0m8-8a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm10 2-4.35-4.35',
  x: 'M18 6 6 18M6 6l12 12',
  power: 'M12 2v10M18.4 6.6a9 9 0 1 1-12.77.04',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m4-1v5l4 2',
  play: 'M6 4l14 8-14 8V4z',
  pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
  arrow: 'M12 3l7 18-7-4-7 4 7-18z',
  plus: 'M12 5v14M5 12h14',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9',
  check: 'M20 6 9 17l-5-5',
  gauge: 'M12 14l4-4M3.34 19a10 10 0 1 1 17.32 0',
  pin: 'M12 22s7-7.1 7-12a7 7 0 1 0-14 0c0 4.9 7 12 7 12zm0-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  truck: 'M10 17h4V5H2v12h3m15 0h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1M7.5 19.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm10 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  bike: 'M5.5 20a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm13 0a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5V14l-3-3 4-3 2 3h2',
  bus: 'M8 6v6m7-6v6M2 12h19.6M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3m2 2a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm2-2h5m2 2a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  box: 'M21 8 12 3 3 8v8l9 5 9-5V8zM3 8l9 5 9-5m-9 5v8',
  boat: 'M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 .6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M19.4 17 21 12H3l1.6 5M12 12V3l-6 9m6-9 6 9',
  bolt: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z',
  paw: 'M11 5a2 2 0 1 0-4 0 2 2 0 0 0 4 0zm6 0a2 2 0 1 0-4 0 2 2 0 0 0 4 0zM6 11a2 2 0 1 0-4 0 2 2 0 0 0 4 0zm16 0a2 2 0 1 0-4 0 2 2 0 0 0 4 0zM12 12c-3 0-6 4-6 7 0 1.5 1 2 2.5 2 1.6 0 2.3-1 3.5-1s1.9 1 3.5 1c1.5 0 2.5-.5 2.5-2 0-3-3-7-6-7z',
  key: 'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4',
};

export function Icon({ name, size = 18, className }: { name: keyof typeof PATHS | string; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name] ?? PATHS.pin} />
    </svg>
  );
}

export const KIND_ICON: Record<DeviceKind, string> = {
  car: 'car',
  motorbike: 'bike',
  truck: 'truck',
  bus: 'bus',
  boat: 'boat',
  generator: 'bolt',
  asset: 'box',
  person: 'user',
  pet: 'paw',
  other: 'pin',
};
