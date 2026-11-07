import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { Marker, Tooltip, useMap } from 'react-leaflet';
import type { Device } from '../api/types';
import { BaseMap, vehicleIcon } from './BaseMap';

function FitOnce({ devices }: { devices: Device[] }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    const pts = devices.filter((d) => d.position).map((d) => [d.position!.lat, d.position!.lon] as [number, number]);
    if (pts.length === 0) return;
    done.current = true;
    if (pts.length === 1) map.setView(pts[0]!, 14);
    else map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15 });
  }, [devices, map]);
  return null;
}

function FollowSelected({ device }: { device: Device | undefined }) {
  const map = useMap();
  const lastId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!device?.position) return;
    const target: [number, number] = [device.position.lat, device.position.lon];
    if (lastId.current !== device.id) {
      lastId.current = device.id;
      map.flyTo(target, Math.max(map.getZoom(), 15), { duration: 0.6 });
    } else if (!map.getBounds().pad(-0.2).contains(target)) {
      // Keep a moving selected vehicle in view.
      map.panTo(target);
    }
  }, [device, map]);
  return null;
}

export function FleetMap({
  devices,
  selectedId,
  onSelect,
}: {
  devices: Device[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const selected = devices.find((d) => d.id === selectedId);
  return (
    <BaseMap>
      <FitOnce devices={devices} />
      <FollowSelected device={selected} />
      {devices
        .filter((d) => d.position)
        .map((d) => (
          <Marker
            key={d.id}
            position={[d.position!.lat, d.position!.lon]}
            icon={vehicleIcon(d.status, d.position!.course, d.id === selectedId)}
            eventHandlers={{ click: () => onSelect(d.id) }}
            zIndexOffset={d.id === selectedId ? 1000 : 0}
            keyboard
            title={d.name}
          >
            <Tooltip direction="top" offset={[0, -14]} className="vmarker-label" permanent={d.id === selectedId}>
              {d.name}
            </Tooltip>
          </Marker>
        ))}
    </BaseMap>
  );
}
