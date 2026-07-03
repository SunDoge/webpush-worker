import { sValidator } from '@hono/standard-validator';
import { createFactory } from 'hono/factory';
import { getDb } from '../db';
import { subscribeSchema } from '../schemas';
import type { AuthEnv } from '../types';

const factory = createFactory<AuthEnv>();

export const listDevices = factory.createHandlers(async (c) => {
  const user = c.var.user;
  const db = getDb(c.env.DB);

  const data = await db
    .selectFrom('devices')
    .select(['id', 'name', 'endpoint', 'created_at', 'last_seen_at'])
    .where('user_id', '=', user.id)
    .orderBy('last_seen_at', 'desc')
    .execute();

  return c.json({ code: 'ok', data });
});

export const subscribeDevice = factory.createHandlers(
  sValidator('json', subscribeSchema),
  async (c) => {
    const user = c.var.user;
    const db = getDb(c.env.DB);
    const body = c.req.valid('json') as any;

    const subStr =
      typeof body.subscription === 'string' ? body.subscription : JSON.stringify(body.subscription);

    const topicsArray = (body.topics || 'default')
      .split(',')
      .map((t: string) => t.trim())
      .filter((t: string) => t.length > 0);

    // 校验所有 topic 必须存在于该用户的 user_topics
    const existingTopics = await db
      .selectFrom('user_topics')
      .select('name')
      .where('user_id', '=', user.id)
      .where('name', 'in', topicsArray)
      .execute();

    const existingNames = new Set(existingTopics.map((t) => t.name));
    const unknownTopics = topicsArray.filter((t: string) => !existingNames.has(t));
    if (unknownTopics.length > 0) {
      return c.json(
        { code: 'invalid_params', msg: `Unknown topics: ${unknownTopics.join(', ')}` },
        400,
      );
    }

    // 先查是否已存在（复用旧 ID），否则服务端生成新 UUID
    const existing = await db
      .selectFrom('devices')
      .select('id')
      .where('endpoint', '=', body.endpoint)
      .where('user_id', '=', user.id)
      .executeTakeFirst();

    const deviceId = existing?.id ?? crypto.randomUUID();

    if (existing) {
      await db
        .updateTable('devices')
        .set({ name: body.name, subscription: subStr, last_seen_at: Math.floor(Date.now() / 1000) })
        .where('id', '=', deviceId)
        .execute();
    } else {
      await db
        .insertInto('devices')
        .values({
          id: deviceId,
          user_id: user.id,
          name: body.name,
          endpoint: body.endpoint,
          subscription: subStr,
          last_seen_at: Math.floor(Date.now() / 1000),
        })
        .execute();
    }

    // Replace topic associations
    await db.deleteFrom('device_topics').where('device_id', '=', deviceId).execute();

    if (topicsArray.length > 0) {
      await db
        .insertInto('device_topics')
        .values(topicsArray.map((topic: string) => ({ device_id: deviceId, topic })))
        .execute();
    }

    return c.json({ code: 'ok', data: { id: deviceId } });
  },
);

export const deleteDevice = factory.createHandlers(async (c) => {
  const user = c.var.user;
  const id = c.req.param('id');
  if (!id) {
    return c.json({ code: 'invalid_params', msg: 'ID parameter is required' }, 400);
  }
  const db = getDb(c.env.DB);

  await db.deleteFrom('devices').where('id', '=', id).where('user_id', '=', user.id).execute();

  return c.json({ code: 'ok', data: null });
});
