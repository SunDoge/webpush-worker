import { sValidator } from '@hono/standard-validator';
import { createFactory } from 'hono/factory';
import { getDb } from '../db';
import { createTopicSchema } from '../schemas';
import type { AuthEnv } from '../types';

const factory = createFactory<AuthEnv>();

export const listTopics = factory.createHandlers(async (c) => {
  const user = c.var.user;
  const { db } = getDb(c.env.DB);

  const list = await db
    .selectFrom('user_topics')
    .selectAll()
    .where('user_id', '=', user.id)
    .orderBy('name', 'asc')
    .execute();

  return c.json({ code: 'ok' as const, data: list });
});

export const createTopic = factory.createHandlers(
  sValidator('json', createTopicSchema),
  async (c) => {
    const user = c.var.user;
    const { name } = c.req.valid('json');
    const { db } = getDb(c.env.DB);

    const existing = await db
      .selectFrom('user_topics')
      .select('name')
      .where('user_id', '=', user.id)
      .where('name', '=', name)
      .executeTakeFirst();

    if (existing) {
      return c.json({ code: 'topic_already_exists' as const, msg: 'Topic already exists' }, 400);
    }

    await db
      .insertInto('user_topics')
      .values({ user_id: user.id, name, created_at: Math.floor(Date.now() / 1000) })
      .execute();

    return c.json({ code: 'ok' as const, data: { name } });
  },
);

export const deleteTopic = factory.createHandlers(async (c) => {
  const user = c.var.user;
  const name = c.req.param('name');
  if (!name) {
    return c.json({ code: 'invalid_params' as const, msg: 'Name parameter is required' }, 400);
  }

  if (name === 'default') {
    return c.json({ code: 'invalid_params' as const, msg: 'Cannot delete the default topic' }, 400);
  }

  const { db, dialect } = getDb(c.env.DB);

  const q1 = db.deleteFrom('user_topics').where('user_id', '=', user.id).where('name', '=', name);

  // Cascade: remove this topic from all of the user's device subscriptions
  const q2 = db
    .deleteFrom('device_topics')
    .where('topic', '=', name)
    .where('device_id', 'in', (eb) =>
      eb.selectFrom('devices').select('id').where('user_id', '=', user.id),
    );

  await dialect.batch([q1.compile(), q2.compile()]);

  return c.json({ code: 'ok' as const, data: null });
});
