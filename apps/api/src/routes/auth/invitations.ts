/**
 * Invitation code management routes — mounted at /api/auth by the root app.
 * Admin only.
 *
 * POST   /api/auth/invitations        — generate an invitation code
 * GET    /api/auth/invitations        — list all invitation codes
 * DELETE /api/auth/invitations/:code  — revoke a pending invitation code
 */
import { Hono } from 'hono';
import type { Handler } from 'hono';
import { getDb } from '../../db';
import type { UserInfo } from '../../middleware/auth';
import { authMiddleware } from '../../middleware/auth';
import type { AuthEnv } from '../../types';
import { serverError } from '../../utils/error';

const createInvitation = (async (c) => {
  try {
    const user = c.get('user') as UserInfo;
    if (user.role !== 'admin') {
      return c.json({ success: false, error: 'Admin role required' }, 403);
    }

    const db = getDb(c.env.DB);
    const genSeg = () => Math.random().toString(36).substring(2, 6).toUpperCase();
    const code = `INV-${genSeg()}-${genSeg()}`;
    const createdAt = Math.floor(Date.now() / 1000);

    await db
      .insertInto('invitation_codes')
      .values({ code, created_by: user.id, status: 'pending', created_at: createdAt })
      .execute();

    return c.json({ success: true, data: { code, created_at: createdAt, status: 'pending' } });
  } catch (err) {
    return serverError(c, err);
  }
}) satisfies Handler<AuthEnv, '/invitations'>;

const listInvitations = (async (c) => {
  try {
    const user = c.get('user') as UserInfo;
    if (user.role !== 'admin') {
      return c.json({ success: false, error: 'Admin role required' }, 403);
    }

    const db = getDb(c.env.DB);
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

    return c.json({ success: true, data: list });
  } catch (err) {
    return serverError(c, err);
  }
}) satisfies Handler<AuthEnv, '/invitations'>;

const revokeInvitation = (async (c) => {
  try {
    const user = c.get('user') as UserInfo;
    if (user.role !== 'admin') {
      return c.json({ success: false, error: 'Admin role required' }, 403);
    }

    const code = c.req.param('code');
    const db = getDb(c.env.DB);

    await db
      .deleteFrom('invitation_codes')
      .where('code', '=', code)
      .where('status', '=', 'pending')
      .execute();

    return c.json({ success: true, data: null });
  } catch (err) {
    return serverError(c, err);
  }
}) satisfies Handler<AuthEnv, '/invitations/:code'>;

const invitationsRouter = new Hono<AuthEnv>()
  .post('/invitations', authMiddleware, createInvitation)
  .get('/invitations', authMiddleware, listInvitations)
  .delete('/invitations/:code', authMiddleware, revokeInvitation);

export { invitationsRouter };
