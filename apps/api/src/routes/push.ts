import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';
// @ts-expect-error
import { generatePushHTTPRequest } from 'webpush-webcrypto';
import { getDb } from '../db';
import { authMiddleware } from '../middleware/auth';
import { sendSchema } from '../schemas';
import { loadVapidKeys, priorityToUrgency } from '../utils/vapid';

const pushRouter = new Hono<{ Bindings: CloudflareBindings }>();

// 依然在运行时注册 /send/:topic 接口，保证外部 CURL 定时任务等兼容性
pushRouter.post('/send/:topic', authMiddleware, sValidator('json', sendSchema), async (c) => {
  const user = c.get('user' as any) as any;
  if (!user?.id) {
    return c.json({ success: false, error: 'User login required' }, 401);
  }

  const topic = c.req.param('topic') || 'default';
  const body = c.req.valid('json') as any;

  const title = body.title || '';
  const bodyText = body.body;
  const url = body.url || '';
  const priority = Number(body.priority) || 3;
  const tags = body.tags || '';

  try {
    const notificationId = crypto.randomUUID();
    const createdAt = Math.floor(Date.now() / 1000);

    // 初始化 VAPID 密钥
    const keys = await loadVapidKeys(c.env.VAPID_PUBLIC_KEY, c.env.VAPID_SECRET_KEY);

    const db = getDb(c.env.DB);

    // 查询该用户下订阅了该 topic 的设备 (通过 SQL JOIN 高效过滤)
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

    let successCount = 0;
    let failCount = 0;

    for (const device of targetDevices) {
      try {
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
            keys: {
              p256dh: sub.keys.p256dh,
              auth: sub.keys.auth,
            },
          },
          adminContact: 'mailto:admin@example.com',
          ttl: 60 * 60 * 24, // 1天
          urgency: priorityToUrgency(priority),
        });

        const res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: pushBody,
        });

        if (res.status === 201 || res.status === 200 || res.ok) {
          successCount++;
          // 更新最后活跃时间
          await db
            .updateTable('devices')
            .set({ last_seen_at: Math.floor(Date.now() / 1000) })
            .where('id', '=', device.id)
            .execute();
        } else if (res.status === 410 || res.status === 404) {
          // 订阅过期或失效，自动修剪
          await db.deleteFrom('devices').where('id', '=', device.id).execute();
          failCount++;
        } else {
          console.error(`Failed to push to device ${device.name}: Status ${res.status}`);
          failCount++;
        }
      } catch (err) {
        console.error(`Error pushing to device ${device.name}:`, err);
        failCount++;
      }
    }

    // 后端已按要求删除 notifications 存储表以降低 D1 存储压力，仅依赖前端 Dexie 离线缓存

    return c.json({
      success: true,
      data: {
        id: notificationId,
        sent: targetDevices.length,
        successCount,
        failCount,
      },
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message as string }, 500);
  }
});

export { pushRouter };
