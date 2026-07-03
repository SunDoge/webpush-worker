import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { verify } from 'hono/jwt';
import { getDb } from '../db';

export type UserInfo = {
  id: string;
  username: string;
  role: string;
};

export async function getAuthorizedUser(
  c: Context<{
    Bindings: CloudflareBindings;
    Variables: {
      user: UserInfo;
    };
  }>,
): Promise<UserInfo | null> {
  // 获取 Token 的三种方式
  let token: string | null = null;
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else {
    token = c.req.header('X-Token') || c.req.query('token') || null;
  }

  if (!token) {
    return null;
  }

  // 1. 尝试验证不透明的本地 API Token (wpt_ 开头)
  if (token.startsWith('wpt_')) {
    try {
      const db = getDb(c.env.DB);
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(token));
      const tokenHash = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));

      const dbToken = await db
        .selectFrom('api_tokens')
        .selectAll()
        .where('token_hash', '=', tokenHash)
        .executeTakeFirst();

      if (dbToken) {
        // 校验过期时间
        if (dbToken.expires_at && dbToken.expires_at < Math.floor(Date.now() / 1000)) {
          return null;
        }

        // 查询对应的用户信息
        const user = await db
          .selectFrom('users')
          .selectAll()
          .where('id', '=', dbToken.user_id)
          .executeTakeFirst();

        if (user) {
          return {
            id: user.id,
            username: user.username,
            role: user.role,
          };
        }
      }
    } catch (err) {
      console.error('Verify API token error:', err);
    }
    return null;
  }

  // 2. 尝试验证 JWT
  try {
    const jwtSecret = c.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET is not configured in environment variables!');
      return null;
    }
    const payload = await verify(token, jwtSecret, 'HS256');
    return {
      id: payload.id as string,
      username: payload.username as string,
      role: payload.role as string,
    };
  } catch (_err) {
    return null;
  }
}

export const authMiddleware = createMiddleware(async (c, next) => {
  const user = await getAuthorizedUser(c);
  if (!user) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }
  // 在 Hono 上下文中保存用户信息
  c.set('user', user);
  await next();
});
