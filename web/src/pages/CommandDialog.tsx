import { useState, type FormEvent } from 'react';
import { useSendCommand } from '../api/hooks';
import type { CommandResult, Device } from '../api/types';
import { ErrorNote, Field, Modal } from '../components/ui';

export type CommandKind = 'engine_cut' | 'engine_restore' | 'speed_limit';

const TITLES: Record<CommandKind, string> = {
  engine_cut: 'Cut engine',
  engine_restore: 'Restore engine',
  speed_limit: 'Set speed limit alarm',
};

/**
 * Confirmation for commands. Cutting the engine is the dangerous one: the user
 * must type the plate number (or vehicle name) to confirm.
 */
export function CommandDialog({ device, kind, onClose }: { device: Device; kind: CommandKind; onClose: () => void }) {
  const send = useSendCommand(device.id);
  const [typed, setTyped] = useState('');
  const [speed, setSpeed] = useState('100');
  const [seconds, setSeconds] = useState('30');
  const [result, setResult] = useState<CommandResult>();

  const confirmWord = device.plateNumber || device.name;
  const needsTyping = kind === 'engine_cut';
  const typedOk = !needsTyping || typed.trim().toLowerCase() === confirmWord.trim().toLowerCase();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!typedOk) return;
    const body =
      kind === 'speed_limit'
        ? { command: kind, confirm: true as const, speedKmh: Number(speed), durationSeconds: Number(seconds) }
        : { command: kind, confirm: true as const };
    try {
      setResult(await send.mutateAsync(body));
    } catch {
      // shown via send.error
    }
  };

  if (result) {
    return (
      <Modal
        title={TITLES[kind]}
        onClose={onClose}
        footer={
          <button className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        }
      >
        <div className={`alert ${result.accepted ? 'alert-ok' : 'alert-warn'}`} role="status">
          <strong>{result.accepted ? 'Command sent' : 'Command not delivered'}</strong>
          <div>{result.statusText}</div>
        </div>
        {!result.accepted && (
          <p className="muted small">
            The tracker did not receive the command. It may be switched off or without network. Try again when it shows as online.
          </p>
        )}
      </Modal>
    );
  }

  return (
    <Modal
      title={TITLES[kind]}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="command-form"
            className={kind === 'engine_cut' ? 'btn btn-danger' : 'btn btn-primary'}
            disabled={!typedOk || send.isPending}
          >
            {send.isPending ? 'Sending…' : TITLES[kind]}
          </button>
        </>
      }
    >
      <form id="command-form" onSubmit={submit}>
        <p style={{ marginTop: 0 }}>
          <strong>{device.name}</strong>
          {device.plateNumber && <span className="muted"> · {device.plateNumber}</span>}
        </p>
        {kind === 'engine_cut' && (
          <>
            <div className="alert alert-warn">
              This immobilises the vehicle: it will not restart until you restore the engine. Only do this when it is safe. Cutting the
              engine of a fast-moving vehicle can cause an accident.
            </div>
            <Field label={`Type ${device.plateNumber ? 'the plate number' : 'the vehicle name'} to confirm`} hint={confirmWord}>
              <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            </Field>
          </>
        )}
        {kind === 'engine_restore' && <p>The engine will be able to start again.</p>}
        {kind === 'speed_limit' && (
          <>
            <p className="muted small" style={{ marginTop: 0 }}>
              The tracker raises an overspeed alarm when the vehicle goes faster than this for longer than the given time.
            </p>
            <div className="row">
              <Field label="Speed (km/h)">
                <input className="input" type="number" min={20} max={250} value={speed} onChange={(e) => setSpeed(e.target.value)} required />
              </Field>
              <Field label="For at least (seconds)">
                <input className="input" type="number" min={1} max={600} value={seconds} onChange={(e) => setSeconds(e.target.value)} required />
              </Field>
            </div>
          </>
        )}
        <ErrorNote error={send.error} />
      </form>
    </Modal>
  );
}
