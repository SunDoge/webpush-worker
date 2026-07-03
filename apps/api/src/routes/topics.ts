/**
 * Topic management routes — mounted at /api/topics by the root app.
 *
 * GET    /api/topics        — list current user's topics
 * POST   /api/topics        — create a topic
 * DELETE /api/topics/:name  — delete a topic (cascades device subscriptions)
 */
import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';
import type { Handler } from 'hono';
import { getDb } from '../db';
import { authMiddleware } from '../middleware/auth';
import { createTopicSchema } from '../schemas';
import type { AuthEnv } from '../types';
import { serverError } from '../utils/error';

const listTopics = (async (c) => {
  try {
    const user = c.var.user;
    const db = getDb(c.env.DB);

    const list = await db
      .selectFrom('user_topics')
      .selectAll()
      .where('user_id', '=', user.id)
      .orderBy('name', 'asc')
      .execute();

    return c.json({ success: true, data: list });
  } catch (err) {
    return serverError(c, err);
  }
}) satisfies Handler<AuthEnv, '/'>;

const createTopic = (async (c) => {
  try {
    const user = c.var.user;
    const { name } = c.req.valid('json') as { name: string };
    const db = getDb(c.env.DB);

    const existing = await db
      .selectFrom('user_topics')
      .select('name')
      .where('user_id', '=', user.id)
      .where('name', '=', name)
      .executeTakeFirst();

    if (existing) {
      return c.json({ success: false, error: 'Topic already exists' }, 400);
    }

    await db
      .insertInto('user_topics')
      .values({ user_id: user.id, name, created_at: Math.floor(Date.now() / 1000) })
      .execute();

    return c.json({ success: true, data: { name } });
  } catch (err) {
    return serverError(c, err);
  }
}) satisfies Handler<AuthEnv, '/', any>;

const deleteTopic = (async (c) => {
  try {
    const user = c.var.user;
    const name = c.req.param('name');

    if (name === 'default') {
      return c.json({ success: false, error: 'Cannot delete the default topic' }, 400);
    }

    const db = getDb(c.env.DB);

    await db
      .deleteFrom('user_topics')
      .where('user_id', '=', user.id)
      .where('name', '=', name)
      .execute();

    // Cascade: remove this topic from all of the user's device subscriptions
    await db
      .deleteFrom('device_topics')
      .where('topic', '=', name)
      .where('device_id', 'in', (eb) =>
        eb.selectFrom('devices').select('id').where('user_id', '=', user.id),
      )
      .execute();

    return c.json({ success: true, data: null });
  } catch (err) {
    return serverError(c, err);
  }
}) satisfies Handler<AuthEnv, '/:name'>;

const topicsRouter = new Hono<AuthEnv>()
  .get('/', authMiddleware, listTopics)
  .post('/', authMiddleware, sValidator('json', createTopicSchema), createTopic)
  .delete('/:name', authMiddleware, deleteTopic);

export { topicsRouter };
