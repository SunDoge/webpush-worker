/**
 * API token management routes — mounted at /api/auth by the root app.
 *
 * POST   /api/auth/token       — create a long-lived opaque API token
 * GET    /api/auth/tokens      — list current user's API tokens
 * DELETE /api/auth/tokens/:id  — revoke an API token
 */
import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';
import type { Handler } from 'hono';
import { getDb } from '../../db';
import type { UserInfo } from '../../middleware/auth';
import { authMiddleware } from '../../middleware/auth';
import { createTokenSchema } from '../../schemas';
import type { AuthEnv } from '../../types';
import { serverError } from '../../utils/error';

const createToken = (async (c) => {
  try {
    const user = c.get('user') as UserInfo;
    const { name } = c.req.valid('json') as { name: string };
    const db = getDb(c.env.DB);

    // Generate a 24-byte random token encoded as base64url with wpt_ prefix
    const buffer = new Uint8Array(24);
    crypto.getRandomValues(buffer);
    const tokenRaw = `wpt_${btoa(String.fromCharCode(...buffer))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')}`;

    // SHA-256 hash for safe storage (raw token is never persisted)
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(tokenRaw));
    const tokenHash = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));

    const tokenId = crypto.randomUUID();
    const createdAt = Math.floor(Date.now() / 1000);
    const expiresAt = createdAt + 60 * 60 * 24 * 365 * 10; // 10 years

    await db
      .insertInto('api_tokens')
      .values({
        id: tokenId,
        user_id: user.id,
        name,
        token_hash: tokenHash,
        created_at: createdAt,
        expires_at: expiresAt,
      })
      .execute();

    return c.json({
      success: true,
      data: { id: tokenId, name, token: tokenRaw, created_at: createdAt, expires_at: expiresAt },
    });
  } catch (err) {
    return serverError(c, err);
  }
}) satisfies Handler<AuthEnv, '/token', any>;

const listTokens = (async (c) => {
  try {
    const user = c.get('user') as UserInfo;
    const db = getDb(c.env.DB);

    const tokens = await db
      .selectFrom('api_tokens')
      .select(['id', 'name', 'created_at', 'expires_at'])
      .where('user_id', '=', user.id)
      .orderBy('created_at', 'desc')
      .execute();

    return c.json({ success: true, data: tokens });
  } catch (err) {
    return serverError(c, err);
  }
}) satisfies Handler<AuthEnv, '/tokens'>;

const revokeToken = (async (c) => {
  try {
    const user = c.get('user') as UserInfo;
    const tokenId = c.req.param('id');
    const db = getDb(c.env.DB);

    await db
      .deleteFrom('api_tokens')
      .where('id', '=', tokenId)
      .where('user_id', '=', user.id)
      .execute();

    return c.json({ success: true, data: null });
  } catch (err) {
    return serverError(c, err);
  }
}) satisfies Handler<AuthEnv, '/tokens/:id'>;

const tokensRouter = new Hono<AuthEnv>()
  .post('/token', authMiddleware, sValidator('json', createTokenSchema), createToken)
  .get('/tokens', authMiddleware, listTokens)
  .delete('/tokens/:id', authMiddleware, revokeToken);

export { tokensRouter };
