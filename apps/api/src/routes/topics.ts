import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';
import { getDb } from '../db';
import { authMiddleware } from '../middleware/auth';
import { createTopicSchema } from '../schemas';

type Bindings = {
  DB: D1Database;
};

const topicsRouter = new Hono<{ Bindings: Bindings }>()
  // 1. 获取主题列表
  .get('/topics', authMiddleware, async (c) => {
    try {
      const user = c.get('user' as any) as any;
      if (!user?.id) {
        return c.json({ success: false, error: 'User login required' }, 401);
      }

      const db = getDb(c.env.DB);
      const list = await db
        .selectFrom('user_topics')
        .selectAll()
        .where('user_id', '=', user.id)
        .orderBy('name', 'asc')
        .execute();

      return c.json({ success: true, data: list });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 500);
    }
  })
  // 2. 创建主题
  .post('/topics', authMiddleware, sValidator('json', createTopicSchema), async (c) => {
    try {
      const user = c.get('user' as any) as any;
      if (!user?.id) {
        return c.json({ success: false, error: 'User login required' }, 401);
      }

      const { name } = c.req.valid('json');
      const db = getDb(c.env.DB);

      // 检查主题是否已存在
      const existing = await db
        .selectFrom('user_topics')
        .selectAll()
        .where('user_id', '=', user.id)
        .where('name', '=', name)
        .executeTakeFirst();

      if (existing) {
        return c.json({ success: false, error: 'Topic already exists' }, 400);
      }

      await db
        .insertInto('user_topics')
        .values({
          user_id: user.id,
          name,
          created_at: Math.floor(Date.now() / 1000),
        })
        .execute();

      return c.json({ success: true, data: { name } });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 500);
    }
  })
  // 3. 删除主题
  .delete('/topics/:name', authMiddleware, async (c) => {
    try {
      const user = c.get('user' as any) as any;
      if (!user?.id) {
        return c.json({ success: false, error: 'User login required' }, 401);
      }

      const name = c.req.param('name');
      if (name === 'default') {
        return c.json({ success: false, error: 'Cannot delete default topic' }, 400);
      }

      const db = getDb(c.env.DB);

      // 删除主题
      await db
        .deleteFrom('user_topics')
        .where('user_id', '=', user.id)
        .where('name', '=', name)
        .execute();

      // 级联退订该用户的设备对此主题的订阅
      await db
        .deleteFrom('device_topics')
        .where('topic', '=', name)
        .where('device_id', 'in', (eb) =>
          eb.selectFrom('devices').select('id').where('user_id', '=', user.id),
        )
        .execute();

      return c.json({ success: true, data: null });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 500);
    }
  });

export { topicsRouter };
