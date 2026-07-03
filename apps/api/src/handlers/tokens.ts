import { sValidator } from '@hono/standard-validator';
import { createFactory } from 'hono/factory';
import { getDb } from '../db';
import { createTokenSchema } from '../schemas';
import type { AuthEnv } from '../types';

const factory = createFactory<AuthEnv>();

export const createToken = factory.createHandlers(
  sValidator('json', createTokenSchema),
  async (c) => {
    const user = c.var.user;
    const { name } = c.req.valid('json');
    const { db } = getDb(c.env.DB);

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
      code: 'ok' as const,
      data: {
        id: tokenId,
        name,
        token: tokenRaw,
        created_at: createdAt,
        expires_at: expiresAt,
      },
    });
  },
);

export const listTokens = factory.createHandlers(async (c) => {
  const user = c.var.user;
  const { db } = getDb(c.env.DB);

  const tokens = await db
    .selectFrom('api_tokens')
    .select(['id', 'name', 'created_at', 'expires_at'])
    .where('user_id', '=', user.id)
    .orderBy('created_at', 'desc')
    .execute();

  return c.json({ code: 'ok' as const, data: tokens });
});

export const revokeToken = factory.createHandlers(async (c) => {
  const user = c.var.user;
  const tokenId = c.req.param('id');
  if (!tokenId) {
    return c.json({ code: 'invalid_params' as const, msg: 'Token ID parameter is required' }, 400);
  }
  const { db } = getDb(c.env.DB);

  await db
    .deleteFrom('api_tokens')
    .where('id', '=', tokenId)
    .where('user_id', '=', user.id)
    .execute();

  return c.json({ code: 'ok' as const, data: null });
});
