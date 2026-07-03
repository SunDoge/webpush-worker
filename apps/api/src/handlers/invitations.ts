import { createFactory } from 'hono/factory';
import { getDb } from '../db';
import type { AuthEnv } from '../types';

const factory = createFactory<AuthEnv>();

export const createInvitation = factory.createHandlers(async (c) => {
  const user = c.var.user;
  if (user.role !== 'admin') {
    return c.json({ code: 'forbidden' as const, msg: 'Admin role required' }, 403);
  }

  const { db } = getDb(c.env.DB);
  const genSeg = () => Math.random().toString(36).substring(2, 6).toUpperCase();
  const code = `INV-${genSeg()}-${genSeg()}`;
  const createdAt = Math.floor(Date.now() / 1000);

  await db
    .insertInto('invitation_codes')
    .values({ code, created_by: user.id, status: 'pending', created_at: createdAt })
    .execute();

  return c.json({ code: 'ok' as const, data: { code, created_at: createdAt, status: 'pending' } });
});

export const listInvitations = factory.createHandlers(async (c) => {
  const user = c.var.user;
  if (user.role !== 'admin') {
    return c.json({ code: 'forbidden' as const, msg: 'Admin role required' }, 403);
  }

  const { db } = getDb(c.env.DB);
  const list = await db
    .selectFrom('invitation_codes')
    .leftJoin('users as creator', 'invitation_codes.created_by', 'creator.id')
    .leftJoin('users as recipient', 'invitation_codes.used_by', 'recipient.id')
    .select([
      'invitation_codes.code',
      'invitation_codes.status',
      'invitation_codes.created_at',
      'invitation_codes.used_at',
      'creator.username as creator_username',
      'recipient.username as recipient_username',
    ])
    .orderBy('invitation_codes.created_at', 'desc')
    .execute();

  return c.json({ code: 'ok' as const, data: list });
});

export const revokeInvitation = factory.createHandlers(async (c) => {
  const user = c.var.user;
  if (user.role !== 'admin') {
    return c.json({ code: 'forbidden' as const, msg: 'Admin role required' }, 403);
  }

  const code = c.req.param('code');
  if (!code) {
    return c.json({ code: 'invalid_params' as const, msg: 'Code parameter is required' }, 400);
  }
  const { db } = getDb(c.env.DB);

  await db
    .deleteFrom('invitation_codes')
    .where('code', '=', code)
    .where('status', '=', 'pending')
    .execute();

  return c.json({ code: 'ok' as const, data: null });
});
