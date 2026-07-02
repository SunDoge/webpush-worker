import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';
import { getDb } from '../db';
import { authMiddleware } from '../middleware/auth';
import { subscribeSchema, unsubscribeSchema } from '../schemas';

type Bindings = {
  DB: D1Database;
  VAPID_PUBLIC_KEY: string;
  VAPID_SECRET_KEY: string;
};

const devicesRouter = new Hono<{ Bindings: Bindings }>()
  // 1. 获取公钥（公开端点）
  .get('/vapid-public-key', (c) => {
    return c.json({
      success: true,
      data: { publicKey: c.env.VAPID_PUBLIC_KEY },
    });
  })
  // 2. 设备订阅
  .post('/subscribe', authMiddleware, sValidator('json', subscribeSchema), async (c) => {
    try {
      const user = c.get('user' as any) as any;
      if (!user?.id) {
        return c.json({ success: false, error: 'User login required' }, 401);
      }

      const db = getDb(c.env.DB);
      const body = c.req.valid('json');

      const subStr =
        typeof body.subscription === 'string'
          ? body.subscription
          : JSON.stringify(body.subscription);

      const topicsArray = (body.topics || 'default')
        .split(',')
        .map((t: string) => t.trim())
        .filter((t: string) => t.length > 0);

      // 事务写入（或顺序写入）插入/更新设备
      await db
        .insertInto('devices')
        .values({
          id: body.id,
          user_id: user.id,
          name: body.name,
          endpoint: body.endpoint,
          subscription: subStr,
          last_seen_at: Math.floor(Date.now() / 1000),
        })
        .onConflict((oc) =>
          oc.column('endpoint').doUpdateSet({
            id: body.id,
            user_id: user.id,
            name: body.name,
            subscription: subStr,
            last_seen_at: Math.floor(Date.now() / 1000),
          }),
        )
        .execute();

      // 清理原有的 topic 关系，重新关联
      await db.deleteFrom('device_topics').where('device_id', '=', body.id).execute();

      if (topicsArray.length > 0) {
        const topicValues = topicsArray.map((topic) => ({
          device_id: body.id,
          topic,
        }));
        await db.insertInto('device_topics').values(topicValues).execute();
      }

      return c.json({ success: true, data: null });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 500);
    }
  })
  // 3. 取消订阅
  .post('/unsubscribe', authMiddleware, sValidator('json', unsubscribeSchema), async (c) => {
    try {
      const user = c.get('user' as any) as any;
      if (!user?.id) {
        return c.json({ success: false, error: 'User login required' }, 401);
      }

      const db = getDb(c.env.DB);
      const body = c.req.valid('json');

      await db
        .deleteFrom('devices')
        .where('endpoint', '=', body.endpoint)
        .where('user_id', '=', user.id)
        .execute();

      return c.json({ success: true, data: null });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 500);
    }
  })
  // 4. 获取设备列表
  .get('/devices', authMiddleware, async (c) => {
    try {
      const user = c.get('user' as any) as any;
      if (!user?.id) {
        return c.json({ success: false, error: 'User login required' }, 401);
      }

      const db = getDb(c.env.DB);

      // 使用 leftJoin 获取关联的 topics 并按设备分组
      const results = await db
        .selectFrom('devices')
        .leftJoin('device_topics', 'devices.id', 'device_topics.device_id')
        .select([
          'devices.id',
          'devices.name',
          'devices.endpoint',
          'devices.created_at',
          'devices.last_seen_at',
          'device_topics.topic',
        ])
        .where('devices.user_id', '=', user.id)
        .execute();

      const devicesMap = new Map<string, any>();
      for (const row of results) {
        if (!devicesMap.has(row.id)) {
          devicesMap.set(row.id, {
            id: row.id,
            name: row.name,
            endpoint: row.endpoint,
            created_at: row.created_at,
            last_seen_at: row.last_seen_at,
            topics: [],
          });
        }
        if (row.topic) {
          devicesMap.get(row.id).topics.push(row.topic);
        }
      }

      const deviceList = Array.from(devicesMap.values()).map((dev) => ({
        ...dev,
        topics: dev.topics.join(', '),
      }));

      return c.json({ success: true, data: deviceList });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 500);
    }
  });

export { devicesRouter };
