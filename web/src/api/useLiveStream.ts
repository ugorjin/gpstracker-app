import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { getToken } from './client';
import { keys } from './hooks';
import type { Device, StreamAlarm, StreamPosition } from './types';

export type StreamState = 'connecting' | 'live' | 'reconnecting';

/**
 * Keeps the live map data fresh from the server's event stream.
 * Positions are merged into the cached `/live` result; alarms are handed to
 * `onAlarm` and refresh the alarm lists.
 */
export function useLiveStream(enabled: boolean, onAlarm: (a: StreamAlarm) => void): StreamState {
  const qc = useQueryClient();
  const [state, setState] = useState<StreamState>('connecting');
  const alarmRef = useRef(onAlarm);
  alarmRef.current = onAlarm;

  useEffect(() => {
    if (!enabled) return;
    let es: EventSource | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let stopped = false;

    const connect = () => {
      const token = getToken();
      if (!token || stopped) return;
      es = new EventSource(`/api/stream?access_token=${encodeURIComponent(token)}`);

      es.addEventListener('ready', () => {
        // After a reconnect, catch up on anything missed while disconnected.
        if (attempt > 0) qc.invalidateQueries({ queryKey: keys.live });
        attempt = 0;
        setState('live');
      });

      es.addEventListener('position', (e) => {
        const p = JSON.parse((e as MessageEvent).data) as StreamPosition;
        qc.setQueryData<{ serverTime: string; devices: Device[] }>(keys.live, (old) => {
          if (!old) return old;
          return {
            ...old,
            devices: old.devices.map((d) =>
              d.id !== p.deviceId
                ? d
                : {
                    ...d,
                    status: p.moving ? 'moving' : 'stopped',
                    position: {
                      ...(d.position ?? {
                        voltage: null,
                        batteryPct: null,
                        odometerKm: null,
                        source: null,
                        fuel: null,
                        sensors: null,
                      }),
                      recordedAt: p.recordedAt,
                      lat: p.lat,
                      lon: p.lon,
                      speedKmh: p.speedKmh,
                      course: p.course,
                      moving: p.moving,
                      statusText: p.statusText,
                      alarmText: p.alarmText,
                      lastSeenAt: new Date().toISOString(),
                    },
                  },
            ),
          };
        });
      });

      es.addEventListener('alarm', (e) => {
        alarmRef.current(JSON.parse((e as MessageEvent).data) as StreamAlarm);
        qc.invalidateQueries({ queryKey: ['alarms'] });
      });

      es.onerror = () => {
        setState('reconnecting');
        // The browser retries by itself while the connection is open-able; if the
        // server refused (e.g. restart, 401) the EventSource is closed and we retry.
        if (es?.readyState === EventSource.CLOSED) {
          es.close();
          attempt++;
          retry = setTimeout(connect, Math.min(30_000, 1000 * 2 ** attempt));
        } else {
          attempt++;
        }
      };
    };

    connect();
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      es?.close();
    };
  }, [enabled, qc]);

  return state;
}
