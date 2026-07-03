import { sValidator } from '@hono/standard-validator';
import { createFactory } from 'hono/factory';
import { match } from 'ts-pattern';
// @ts-expect-error — no type declarations for this package
import { generatePushHTTPRequest } from 'webpush-webcrypto';
import { type Database, getDb } from '../db';
import { sendSchema } from '../schemas';
import type { AuthEnv } from '../types';
import { loadVapidKeys, priorityToUrgency } from '../utils/vapid';

const factory = createFactory<AuthEnv>();

// 异步后台推送通知函数，不阻塞 HTTP 响应
async function sendNotificationsInBackground(
  db: Database,
  targetDevices: Array<{ id: string; name: string; endpoint: string; subscription: string }>,
  keys: any,
  pushPayload: string,
  priority: number,
): Promise<void> {
  const results = await Promise.allSettled(
    targetDevices.map(async (device) => {
      const sub = JSON.parse(device.subscription);

      const {
        headers,
        body: pushBody,
        endpoint,
      } = await generatePushHTTPRequest({
        applicationServerKeys: keys,
        payload: pushPayload,
        target: {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
        },
        adminContact: 'mailto:admin@example.com',
        ttl: 60 * 60 * 24, // 1 day
        urgency: priorityToUrgency(priority),
      });

      const res = await fetch(endpoint, { method: 'POST', headers, body: pushBody });

      await match(res.status)
        .with(200, 201, async () => {
          await db
            .updateTable('devices')
            .set({ last_seen_at: Math.floor(Date.now() / 1000) })
            .where('id', '=', device.id)
            .execute();
        })
        .with(404, 410, async () => {
          // 订阅已失效，清理掉
          await db.deleteFrom('devices').where('id', '=', device.id).execute();
        })
        .otherwise(() => {
          console.error(`Push failed for device "${device.name}": HTTP ${res.status}`);
        });
    }),
  );

  for (const [i, r] of results.entries()) {
    match(r.status)
      .with('rejected', () => {
        console.error(
          `Push error for device "${targetDevices[i].name}":`,
          (r as PromiseRejectedResult).reason,
        );
      })
      .otherwise(() => {});
  }
}

export const sendPush = factory.createHandlers(sValidator('json', sendSchema), async (c) => {
  const user = c.var.user;
  const topic = c.req.param('topic');
  if (!topic) {
    return c.json({ code: 'invalid_params' as const, msg: 'Topic parameter is required' }, 400);
  }
  const body = c.req.valid('json') as any;

  const title = body.title || '';
  const bodyText = body.body;
  const url = body.url || '';
  const priority = Number(body.priority) || 3;
  const tags = body.tags || '';

  const notificationId = crypto.randomUUID();
  const createdAt = Math.floor(Date.now() / 1000);
  const keys = await loadVapidKeys(c.env.VAPID_PUBLIC_KEY, c.env.VAPID_SECRET_KEY);
  const { db } = getDb(c.env.DB);

  const targetDevices = await db
    .selectFrom('devices')
    .innerJoin('device_topics', 'devices.id', 'device_topics.device_id')
    .select(['devices.id', 'devices.name', 'devices.endpoint', 'devices.subscription'])
    .where('devices.user_id', '=', user.id)
    .where('device_topics.topic', '=', topic)
    .execute();

  const pushPayload = JSON.stringify({
    id: notificationId,
    title,
    body: bodyText,
    url,
    priority,
    tags,
    topic,
    created_at: createdAt,
  });

  // 推送在后台执行，不阻塞响应
  c.executionCtx.waitUntil(
    sendNotificationsInBackground(db, targetDevices, keys, pushPayload, priority),
  );

  return c.json({ code: 'ok' as const, data: { id: notificationId, sent: targetDevices.length } });
});
