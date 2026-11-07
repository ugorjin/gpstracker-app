import { EventEmitter } from 'node:events';
import type { FastifyPluginAsync } from 'fastify';
import type { Alarm, Position } from '../domain.js';
import type { PushStore } from '../storage/types.js';
import { normalizePush } from './normalize.js';
import { NonceCache, verifySignature } from './signature.js';

export interface PushReceiverOptions {
  store: PushStore;
  appId: string;
  appSecret: string;
  allowUnsigned: boolean;
  toleranceMs: number;
  storeRaw: boolean;
  /** Emits 'position' and 'alarm' for newly stored records (live map, notifications...). */
  events?: PushEvents;
  now?: () => number;
}

export interface PushEventMap {
  position: [Position];
  alarm: [Alarm];
}

export class PushEvents extends EventEmitter<PushEventMap> {}

/** The vendor counts a push as delivered only on HTTP 200 with a non-empty body. */
const OK_BODY = { code: 0 };

const header = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/**
 * POST /push/vendor: receiver for the vendor's "Http Sign Json" data forwarding.
 * Configure the vendor platform to forward to https://<your-host>/push/vendor
 * with AppId = PUSH_APP_ID and AppSecret = PUSH_APP_SECRET.
 */
export const pushReceiver: FastifyPluginAsync<PushReceiverOptions> = async (app, opts) => {
  const now = opts.now ?? Date.now;
  const nonces = new NonceCache(opts.toleranceMs * 2);

  // Keep the body as the exact raw string: the signature is computed over it.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'string' }, (_req, body, done) => done(null, body));

  app.post('/push/vendor', async (req, reply) => {
    const body = typeof req.body === 'string' ? req.body : '';
    const sign = header(req.headers['x-sign']);

    let signed = false;
    if (sign !== undefined) {
      const result = verifySignature(
        {
          appId: header(req.headers['x-app-id']),
          timestamp: header(req.headers['x-timestamp']),
          nonce: header(req.headers['x-nonce']),
          sign,
        },
        body,
        { appId: opts.appId, appSecret: opts.appSecret, toleranceMs: opts.toleranceMs, now: now() },
      );
      if (!result.ok) {
        req.log.warn({ reason: result.reason }, 'rejected push: signature check failed');
        return reply.code(401).send({ code: 401, error: result.reason });
      }
      if (!nonces.checkAndAdd(header(req.headers['x-nonce'])!, now())) {
        req.log.warn('rejected push: replayed nonce');
        return reply.code(401).send({ code: 401, error: 'replayed_nonce' });
      }
      signed = true;
    } else if (!opts.allowUnsigned) {
      req.log.warn('rejected push: no signature (set AppId and AppSecret in the vendor forwarding settings)');
      return reply.code(401).send({ code: 401, error: 'missing_signature' });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      if (opts.storeRaw) await opts.store.logRawPush({ kind: 'unknown', signed, body, problem: 'invalid JSON' });
      return reply.code(400).send({ code: 400, error: 'invalid_json' });
    }

    // The documented format is one object per request; accept arrays too, just in case.
    const items = Array.isArray(payload) ? payload : [payload];
    let positions = 0;
    let alarms = 0;
    try {
      for (const item of items) {
        const n = normalizePush(item);
        if (opts.storeRaw) {
          await opts.store.logRawPush({
            kind: n.kind,
            deviceId: n.deviceId,
            signed,
            body: items.length === 1 ? body : JSON.stringify(item),
            problem: n.problem,
          });
        }
        if (n.problem) req.log.warn({ deviceId: n.deviceId, problem: n.problem }, 'push not fully usable');
        if (n.position) {
          const { inserted } = await opts.store.savePosition(n.position);
          if (inserted) {
            positions++;
            opts.events?.emit('position', n.position);
          }
        }
        for (const alarm of n.alarms) {
          const { inserted } = await opts.store.saveAlarm(alarm);
          if (inserted) {
            alarms++;
            opts.events?.emit('alarm', alarm);
          }
        }
      }
    } catch (err) {
      // Non-200 tells the vendor the push failed.
      req.log.error({ err }, 'failed to store push');
      return reply.code(500).send({ code: 500, error: 'storage_error' });
    }

    req.log.debug({ positions, alarms }, 'push stored');
    return reply.code(200).send(OK_BODY);
  });
};
