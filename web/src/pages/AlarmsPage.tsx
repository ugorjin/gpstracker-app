import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAcknowledgeAlarm, useAlarms, type AlarmFilter } from '../api/hooks';
import type { Alarm } from '../api/types';
import { useMe } from '../auth/AuthContext';
import { ErrorNote, Field, Modal, Spinner, useToast } from '../components/ui';
import { formatDateTime, timeAgo } from '../lib/format';

export function AlarmsPage() {
  const me = useMe();
  const offset = me.org.utcOffsetMinutes;
  const [status, setStatus] = useState<AlarmFilter['status']>('open');
  const alarms = useAlarms({ status });
  const [acking, setAcking] = useState<Alarm>();

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="grow">Alarms</h1>
        <div className="segmented" role="group" aria-label="Show">
          {(['open', 'acknowledged', 'all'] as const).map((s) => (
            <button key={s} aria-pressed={status === s} onClick={() => setStatus(s)}>
              {s === 'open' ? 'Open' : s === 'acknowledged' ? 'Handled' : 'All'}
            </button>
          ))}
        </div>
      </div>
      <ErrorNote error={alarms.error} />
      {alarms.isPending ? (
        <Spinner />
      ) : (
        <div className="card table-wrap">
          {alarms.data?.alarms.length === 0 ? (
            <div className="empty">{status === 'open' ? 'No open alarms. All clear.' : 'No alarms.'}</div>
          ) : (
            <table className="table responsive">
              <thead>
                <tr>
                  <th>Alarm</th>
                  <th>Vehicle</th>
                  <th>Started</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {alarms.data?.alarms.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.alarmText || `Alarm ${a.alarmCode}`}</strong>
                      {a.count > 1 && <span className="muted small"> ×{a.count}</span>}
                    </td>
                    <td data-label="Vehicle">
                      <Link to={`/?v=${encodeURIComponent(a.deviceId)}`}>{a.deviceName}</Link>
                    </td>
                    <td data-label="Started" title={formatDateTime(a.startedAt, offset)}>
                      {formatDateTime(a.startedAt, offset)} <span className="muted small">({timeAgo(a.startedAt)})</span>
                    </td>
                    <td data-label="Location">
                      {a.lat !== null && a.lon !== null ? (
                        <a href={`https://www.google.com/maps?q=${a.lat},${a.lon}`} target="_blank" rel="noreferrer">
                          Open map
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td data-label="Status">
                      {a.acknowledgedAt ? (
                        <span className="badge ok" title={a.acknowledgeNote ?? undefined}>
                          Handled {timeAgo(a.acknowledgedAt)}
                        </span>
                      ) : (
                        <span className="badge danger">Open</span>
                      )}
                      {a.acknowledgeNote && <div className="muted small">{a.acknowledgeNote}</div>}
                    </td>
                    <td className="actions">
                      {!a.acknowledgedAt && me.permissions.acknowledgeAlarms && (
                        <button className="btn btn-sm" onClick={() => setAcking(a)}>
                          Mark handled
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {acking && <AckDialog alarm={acking} onClose={() => setAcking(undefined)} />}
    </div>
  );
}

function AckDialog({ alarm, onClose }: { alarm: Alarm; onClose: () => void }) {
  const ack = useAcknowledgeAlarm();
  const toast = useToast();
  const [note, setNote] = useState('');
  const submit = async () => {
    try {
      await ack.mutateAsync({ id: alarm.id, note: note.trim() || undefined });
      toast({ kind: 'success', title: 'Alarm marked as handled' });
      onClose();
    } catch {
      // shown below
    }
  };
  return (
    <Modal
      title="Mark alarm as handled"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => void submit()} disabled={ack.isPending}>
            {ack.isPending ? 'Saving…' : 'Mark handled'}
          </button>
        </>
      }
    >
      <p style={{ marginTop: 0 }}>
        <strong>{alarm.alarmText || `Alarm ${alarm.alarmCode}`}</strong> · {alarm.deviceName}
      </p>
      <Field label="What was done? (optional)">
        <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Called the driver, false alarm" maxLength={500} />
      </Field>
      <ErrorNote error={ack.error} />
    </Modal>
  );
}
