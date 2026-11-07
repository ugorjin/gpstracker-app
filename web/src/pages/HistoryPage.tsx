import L from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, Marker, Polyline, Tooltip, useMap } from 'react-leaflet';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useHistory, useLive } from '../api/hooks';
import type { HistoryPoint } from '../api/types';
import { useMe } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { ErrorNote, Field, Spinner } from '../components/ui';
import { formatDateTime, formatDuration, formatSpeed, formatTime, fromLocalInput, startOfDay, toLocalInput } from '../lib/format';
import { summarize } from '../lib/geo';
import { BaseMap, vehicleIcon } from '../map/BaseMap';

type Preset = 'today' | 'yesterday' | '24h' | 'custom';

function presetRange(preset: Exclude<Preset, 'custom'>, offset: number, now = new Date()): [Date, Date] {
  const today = startOfDay(now, offset);
  if (preset === 'today') return [today, now];
  if (preset === 'yesterday') return [new Date(today.getTime() - 86_400_000), today];
  return [new Date(now.getTime() - 86_400_000), now];
}

function FitTrack({ points }: { points: HistoryPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lon] as [number, number])), { padding: [40, 40], maxZoom: 16 });
  }, [points, map]);
  return null;
}

function PanTo({ point }: { point: HistoryPoint | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (point && !map.getBounds().pad(-0.15).contains([point.lat, point.lon])) map.panTo([point.lat, point.lon]);
  }, [point, map]);
  return null;
}

const SPEEDS = [1, 4, 16, 64];

export function HistoryPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const me = useMe();
  const offset = me.org.utcOffsetMinutes;
  const live = useLive();
  const devices = (live.data?.devices ?? []).filter((d) => d.status !== 'subscription_expired');
  const device = live.data?.devices.find((d) => d.id === id);

  const [preset, setPreset] = useState<Preset>('today');
  const [range, setRange] = useState<[Date, Date]>(() => presetRange('today', offset));
  const [fromInput, setFromInput] = useState(() => toLocalInput(range[0], offset));
  const [toInput, setToInput] = useState(() => toLocalInput(range[1], offset));

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p !== 'custom') {
      const r = presetRange(p, offset);
      setRange(r);
      setFromInput(toLocalInput(r[0], offset));
      setToInput(toLocalInput(r[1], offset));
    }
  };
  const applyCustom = () => {
    const from = fromLocalInput(fromInput, offset);
    const to = fromLocalInput(toInput, offset);
    if (from && to) setRange([from, to]);
  };

  const fromIso = range[0].toISOString();
  const toIso = range[1].toISOString();
  const history = useHistory(id, fromIso, toIso, !!id);
  const points = useMemo(() => history.data?.points ?? [], [history.data]);
  const summary = useMemo(() => summarize(points), [points]);

  // ---------------------------------------------------------------- player
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(16);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    setIdx(0);
    setPlaying(false);
  }, [points]);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setIdx((i) => {
        if (i >= points.length - 1) {
          setPlaying(false);
          return i;
        }
        // `speed` = minutes of track played per second (4 ticks).
        const target = Date.parse(points[i]!.recordedAt) + (speed * 60_000) / 4;
        let j = i + 1;
        while (j < points.length - 1 && Date.parse(points[j]!.recordedAt) < target) j++;
        return j;
      });
    }, 250);
    return () => clearInterval(timer.current);
  }, [playing, speed, points]);

  const current = points[idx];
  const line = useMemo(() => points.map((p) => [p.lat, p.lon] as [number, number]), [points]);
  const travelled = useMemo(() => line.slice(0, idx + 1), [line, idx]);

  return (
    <div className="history">
      <aside className="history-side">
        <div className="page-head" style={{ marginBottom: 12 }}>
          <Link to={`/?v=${encodeURIComponent(id)}`} className="icon-btn" aria-label="Back to live map">
            ←
          </Link>
          <h1 className="grow" style={{ fontSize: '1.1rem' }}>
            History
          </h1>
        </div>

        <Field label="Vehicle">
          <select className="input" value={id} onChange={(e) => navigate(`/history/${encodeURIComponent(e.target.value)}`)}>
            {!device && <option value={id}>{id}</option>}
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.plateNumber ? ` (${d.plateNumber})` : ''}
              </option>
            ))}
          </select>
        </Field>

        <div className="segmented" role="group" aria-label="Period" style={{ marginBottom: 12, display: 'flex' }}>
          {(['today', 'yesterday', '24h', 'custom'] as Preset[]).map((p) => (
            <button key={p} aria-pressed={preset === p} onClick={() => applyPreset(p)} style={{ flex: 1 }}>
              {p === 'today' ? 'Today' : p === 'yesterday' ? 'Yesterday' : p === '24h' ? '24 h' : 'Custom'}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div>
            <Field label="From">
              <input className="input" type="datetime-local" value={fromInput} onChange={(e) => setFromInput(e.target.value)} />
            </Field>
            <Field label="To" hint="Up to 7 days">
              <input className="input" type="datetime-local" value={toInput} onChange={(e) => setToInput(e.target.value)} />
            </Field>
            <button className="btn btn-primary btn-block" onClick={applyCustom}>
              Show
            </button>
          </div>
        )}

        <ErrorNote error={history.error} />
        {history.isFetching && <p className="muted small">Loading track…</p>}

        {history.data && (
          <>
            <div className="stats">
              <div className="stat">
                <div className="label">Distance</div>
                <div className="value">{summary.distanceKm} km</div>
              </div>
              <div className="stat">
                <div className="label">Driving</div>
                <div className="value">{formatDuration(summary.drivingMs)}</div>
              </div>
              <div className="stat">
                <div className="label">Max speed</div>
                <div className="value">{summary.maxSpeedKmh} km/h</div>
              </div>
              <div className="stat">
                <div className="label">Stops</div>
                <div className="value">{summary.stops.length}</div>
              </div>
            </div>
            {history.data.truncated && <div className="alert alert-warn small">Too many points: only the first 20,000 are shown. Pick a shorter period.</div>}
            {points.length === 0 && <p className="muted">No movement recorded in this period.</p>}
            {summary.stops.length > 0 && (
              <>
                <h3 style={{ margin: '16px 0 4px' }}>Stops (5 min or more)</h3>
                <ul className="stop-list">
                  {summary.stops.map((s) => (
                    <li
                      key={s.startedAt}
                      onClick={() => {
                        const i = points.findIndex((p) => p.recordedAt === s.startedAt);
                        if (i >= 0) setIdx(i);
                      }}
                    >
                      <strong>{formatDuration(s.durationMs)}</strong>
                      <span className="muted">
                        {' '}
                        · {formatTime(s.startedAt, offset).slice(0, 5)}–{formatTime(s.endedAt, offset).slice(0, 5)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </aside>

      <div className="map-wrap">
        {history.isPending && id ? (
          <Spinner label="Loading track…" />
        ) : (
          <BaseMap>
            <FitTrack points={points} />
            <PanTo point={playing ? current : undefined} />
            {line.length > 1 && <Polyline positions={line} pathOptions={{ color: '#94a3b8', weight: 4, opacity: 0.8 }} />}
            {travelled.length > 1 && <Polyline positions={travelled} pathOptions={{ color: '#0f766e', weight: 5 }} />}
            {points[0] && (
              <CircleMarker center={[points[0].lat, points[0].lon]} radius={7} pathOptions={{ color: '#fff', weight: 2, fillColor: '#16a34a', fillOpacity: 1 }}>
                <Tooltip>Start · {formatDateTime(points[0].recordedAt, offset)}</Tooltip>
              </CircleMarker>
            )}
            {points.length > 1 && (
              <CircleMarker
                center={[points[points.length - 1]!.lat, points[points.length - 1]!.lon]}
                radius={7}
                pathOptions={{ color: '#fff', weight: 2, fillColor: '#dc2626', fillOpacity: 1 }}
              >
                <Tooltip>End · {formatDateTime(points[points.length - 1]!.recordedAt, offset)}</Tooltip>
              </CircleMarker>
            )}
            {summary.stops.map((s) => (
              <CircleMarker key={s.startedAt} center={[s.lat, s.lon]} radius={6} pathOptions={{ color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }}>
                <Tooltip>
                  Stopped {formatDuration(s.durationMs)} · {formatTime(s.startedAt, offset).slice(0, 5)}
                </Tooltip>
              </CircleMarker>
            ))}
            {current && <Marker position={[current.lat, current.lon]} icon={vehicleIcon(current.moving ? 'moving' : 'stopped', current.course, true)} />}
          </BaseMap>
        )}

        {points.length > 1 && current && (
          <div className="player">
            <button className="btn btn-primary btn-sm" onClick={() => (idx >= points.length - 1 ? (setIdx(0), setPlaying(true)) : setPlaying(!playing))} aria-label={playing ? 'Pause' : 'Play'}>
              <Icon name={playing ? 'pause' : 'play'} size={16} />
            </button>
            <input
              type="range"
              min={0}
              max={points.length - 1}
              value={idx}
              onChange={(e) => {
                setPlaying(false);
                setIdx(Number(e.target.value));
              }}
              aria-label="Position in track"
            />
            <select className="input" style={{ width: 'auto', minHeight: 32, padding: '4px 8px' }} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Playback speed">
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s} min/s
                </option>
              ))}
            </select>
            <span className="now">
              <strong>{formatTime(current.recordedAt, offset)}</strong> · {formatSpeed(current.speedKmh)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
