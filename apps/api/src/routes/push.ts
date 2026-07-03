/**
 * Push notification routes — mounted at /api/push by the root app.
 *
 * POST /api/push/:topic — send a push notification to all devices subscribed to a topic
 */
import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';
import type { Handler } from 'hono';
// @ts-expect-error — no type declarations for this package
import { generatePushHTTPRequest } from 'webpush-webcrypto';
import { getDb } from '../db';
import { authMiddleware } from '../middleware/auth';
import { sendSchema } from '../schemas';
import type { AuthEnv } from '../types';
import { serverError } from '../utils/error';
import { loadVapidKeys, priorityToUrgency } from '../utils/vapid';

const sendPush = (async (c) => {
  const user = c.var.user;
  const topic = c.req.param('topic');
  const body = c.req.valid('json') as any;

  const title = body.title || '';
  const bodyText = body.body;
  const url = body.url || '';
  const priority = Number(body.priority) || 3;
  const tags = body.tags || '';

  try {
    const notificationId = crypto.randomUUID();
    const createdAt = Math.floor(Date.now() / 1000);
    const keys = await loadVapidKeys(c.env.VAPID_PUBLIC_KEY, c.env.VAPID_SECRET_KEY);
    const db = getDb(c.env.DB);

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
      Promise.allSettled(
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

          if (res.ok || res.status === 201) {
            await db
              .updateTable('devices')
              .set({ last_seen_at: Math.floor(Date.now() / 1000) })
              .where('id', '=', device.id)
              .execute();
          } else if (res.status === 410 || res.status === 404) {
            // 订阅已失效，清理掉
            await db.deleteFrom('devices').where('id', '=', device.id).execute();
          } else {
            console.error(`Push failed for device "${device.name}": HTTP ${res.status}`);
          }
        }),
      ).then((results) => {
        for (const [i, r] of results.entries()) {
          if (r.status === 'rejected') {
            console.error(`Push error for device "${targetDevices[i].name}":`, r.reason);
          }
        }
      }),
    );

    return c.json({
      success: true,
      data: { id: notificationId, sent: targetDevices.length },
    });
  } catch (err) {
    return serverError(c, err);
  }
}) satisfies Handler<AuthEnv, '/:topic', any>;

const pushRouter = new Hono<AuthEnv>().post(
  '/:topic',
  authMiddleware,
  sValidator('json', sendSchema),
  sendPush,
);

export { pushRouter };
