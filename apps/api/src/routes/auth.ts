import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';
import { sign, verify } from 'hono/jwt';
import { getDb } from '../db';
import { authMiddleware } from '../middleware/auth';
import { createTokenSchema, loginSchema, refreshSchema, registerSchema } from '../schemas';
import { hashPassword, verifyPassword } from '../utils/password';
import { verifyTurnstile } from '../utils/turnstile';

type Bindings = {
  DB: D1Database;
  JWT_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
};

const authRouter = new Hono<{ Bindings: Bindings }>()
  // 0. 获取系统注册状态 (首位注册检测)
  .get('/auth/setup-status', async (c) => {
    try {
      const db = getDb(c.env.DB);
      const userCountResult = await db
        .selectFrom('users')
        .select((eb) => eb.fn.count<number>('id').as('count'))
        .executeTakeFirst();

      const count = userCountResult?.count ?? 0;
      return c.json({
        success: true,
        data: {
          hasUsers: count > 0,
          turnstileSiteKey: c.env.TURNSTILE_SITE_KEY || null,
        },
      });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 500);
    }
  })
  // 1. 用户注册
  .post('/auth/register', sValidator('json', registerSchema), async (c) => {
    try {
      const db = getDb(c.env.DB);
      const { username, password, code, turnstileToken } = c.req.valid('json');

      // 验证 Turnstile Token
      const ip = c.req.header('CF-Connecting-IP');
      const isHuman = await verifyTurnstile(turnstileToken, c.env.TURNSTILE_SECRET_KEY, ip);
      if (!isHuman) {
        return c.json({ success: false, error: 'Turnstile verification failed' }, 400);
      }

      // 检查用户名是否已存在
      const existingUser = await db
        .selectFrom('users')
        .selectAll()
        .where('username', '=', username)
        .executeTakeFirst();

      if (existingUser) {
        return c.json({ success: false, error: 'Username already exists' }, 400);
      }

      // 检查是否为第一个注册的用户
      const userCountResult = await db
        .selectFrom('users')
        .select((eb) => eb.fn.count<number>('id').as('count'))
        .executeTakeFirst();

      const count = userCountResult?.count ?? 0;
      const role = count === 0 ? 'admin' : 'user';

      // 邀请码验证逻辑 (如果不是首位用户注册)
      let matchedCode: string | null = null;
      if (count > 0) {
        if (!code) {
          return c.json({ success: false, error: 'Invitation code is required to register' }, 400);
        }

        const inv = await db
          .selectFrom('invitation_codes')
          .selectAll()
          .where('code', '=', code)
          .where('status', '=', 'pending')
          .executeTakeFirst();

        if (!inv) {
          return c.json({ success: false, error: 'Invalid or already used invitation code' }, 400);
        }
        matchedCode = inv.code;
      }

      // 密码哈希
      const passwordHash = await hashPassword(password);
      const userId = crypto.randomUUID();
      const createdAt = Math.floor(Date.now() / 1000);

      // 写入用户表
      await db
        .insertInto('users')
        .values({
          id: userId,
          username,
          password_hash: passwordHash,
          role,
          created_at: createdAt,
        })
        .execute();

      // 如果使用了邀请码，更新邀请码状态为已使用
      if (matchedCode) {
        await db
          .updateTable('invitation_codes')
          .set({
            status: 'used',
            used_by: userId,
            used_at: createdAt,
          })
          .where('code', '=', matchedCode)
          .execute();
      }

      // 生成 JWT Access Token (15 分钟) 和 Refresh Token (30 天)
      const jwtSecret = c.env.JWT_SECRET;
      if (!jwtSecret) {
        return c.json({ success: false, error: 'JWT_SECRET is not configured on the server' }, 500);
      }
      const token = await sign(
        {
          id: userId,
          username,
          role,
          exp: Math.floor(Date.now() / 1000) + 60 * 15, // 15 分钟
        },
        jwtSecret,
        'HS256',
      );
      const refreshToken = await sign(
        {
          id: userId,
          username,
          role,
          is_refresh_token: true,
          exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30, // 30 天
        },
        jwtSecret,
        'HS256',
      );

      return c.json({
        success: true,
        data: {
          user: {
            id: userId,
            username,
            role,
            created_at: createdAt,
          },
          token,
          refreshToken,
        },
      });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 500);
    }
  })
  // 2. 用户登录
  .post('/auth/login', sValidator('json', loginSchema), async (c) => {
    try {
      const db = getDb(c.env.DB);
      const { username, password, turnstileToken } = c.req.valid('json');

      // 验证 Turnstile Token
      const ip = c.req.header('CF-Connecting-IP');
      const isHuman = await verifyTurnstile(turnstileToken, c.env.TURNSTILE_SECRET_KEY, ip);
      if (!isHuman) {
        return c.json({ success: false, error: 'Turnstile verification failed' }, 400);
      }

      // 查询用户
      const user = await db
        .selectFrom('users')
        .selectAll()
        .where('username', '=', username)
        .executeTakeFirst();

      if (!user) {
        return c.json({ success: false, error: 'Invalid username or password' }, 401);
      }

      // 验证密码
      const isPasswordValid = await verifyPassword(password, user.password_hash);
      if (!isPasswordValid) {
        return c.json({ success: false, error: 'Invalid username or password' }, 401);
      }

      // 生成 JWT Access Token (15 分钟) 和 Refresh Token (30 天)
      const jwtSecret = c.env.JWT_SECRET;
      if (!jwtSecret) {
        return c.json({ success: false, error: 'JWT_SECRET is not configured on the server' }, 500);
      }
      const token = await sign(
        {
          id: user.id,
          username: user.username,
          role: user.role,
          exp: Math.floor(Date.now() / 1000) + 60 * 15, // 15 分钟
        },
        jwtSecret,
        'HS256',
      );
      const refreshToken = await sign(
        {
          id: user.id,
          username: user.username,
          role: user.role,
          is_refresh_token: true,
          exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30, // 30 天
        },
        jwtSecret,
        'HS256',
      );

      return c.json({
        success: true,
        data: {
          user: {
            id: user.id,
            username: user.username,
            role: user.role,
            created_at: user.created_at,
          },
          token,
          refreshToken,
        },
      });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 500);
    }
  })
  // 3. 令牌刷新 (Refresh Token)
  .post('/auth/refresh', sValidator('json', refreshSchema), async (c) => {
    try {
      const { refreshToken: clientRefreshToken } = c.req.valid('json');
      const jwtSecret = c.env.JWT_SECRET;
      if (!jwtSecret) {
        return c.json({ success: false, error: 'JWT_SECRET is not configured on the server' }, 500);
      }

      // 验证 Refresh Token 签名及是否过期
      let payload: any;
      try {
        payload = await verify(clientRefreshToken, jwtSecret, 'HS256');
      } catch (_err) {
        return c.json({ success: false, error: 'Invalid or expired refresh token' }, 401);
      }

      // 验证是否为 refresh token
      if (!payload.is_refresh_token) {
        return c.json({ success: false, error: 'Not a valid refresh token' }, 400);
      }

      // 签发全新的 Access Token (15 分钟) 和 Refresh Token (30 天)
      const token = await sign(
        {
          id: payload.id,
          username: payload.username,
          role: payload.role,
          exp: Math.floor(Date.now() / 1000) + 60 * 15, // 15 分钟
        },
        jwtSecret,
        'HS256',
      );
      const refreshToken = await sign(
        {
          id: payload.id,
          username: payload.username,
          role: payload.role,
          is_refresh_token: true,
          exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30, // 30 天
        },
        jwtSecret,
        'HS256',
      );

      return c.json({
        success: true,
        data: {
          token,
          refreshToken,
        },
      });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 500);
    }
  })
  // 4. 生成不透明的长期 API Token
  .post('/auth/token', authMiddleware, sValidator('json', createTokenSchema), async (c) => {
    try {
      const user = c.get('user' as any) as any;
      if (!user?.id) {
        return c.json({ success: false, error: 'User login required' }, 401);
      }

      const { name } = c.req.valid('json');
      const db = getDb(c.env.DB);

      // 生成安全的 24 字节随机 Token (转为 base64url)
      const buffer = new Uint8Array(24);
      crypto.getRandomValues(buffer);
      const tokenRaw = `wpt_${btoa(String.fromCharCode(...buffer))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '')}`;

      // 哈希处理用于安全存储
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(tokenRaw));
      const tokenHash = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));

      const tokenId = crypto.randomUUID();
      const createdAt = Math.floor(Date.now() / 1000);
      const expiresAt = createdAt + 60 * 60 * 24 * 365 * 10; // 10年

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
        data: {
          id: tokenId,
          name,
          token: tokenRaw,
          created_at: createdAt,
          expires_at: expiresAt,
        },
      });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 500);
    }
  })
  // 5. 获取当前用户的 API Tokens 列表
  .get('/auth/tokens', authMiddleware, async (c) => {
    try {
      const user = c.get('user' as any) as any;
      if (!user?.id) {
        return c.json({ success: false, error: 'User login required' }, 401);
      }

      const db = getDb(c.env.DB);
      const tokens = await db
        .selectFrom('api_tokens')
        .select(['id', 'name', 'created_at', 'expires_at'])
        .where('user_id', '=', user.id)
        .orderBy('created_at', 'desc')
        .execute();

      return c.json({
        success: true,
        data: tokens,
      });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 500);
    }
  })
  // 6. 撤销/删除 API Token
  .delete('/auth/tokens/:id', authMiddleware, async (c) => {
    try {
      const user = c.get('user' as any) as any;
      if (!user?.id) {
        return c.json({ success: false, error: 'User login required' }, 401);
      }

      const tokenId = c.req.param('id');
      const db = getDb(c.env.DB);

      // 删除属于该用户的 Token
      await db
        .deleteFrom('api_tokens')
        .where('id', '=', tokenId)
        .where('user_id', '=', user.id)
        .execute();

      return c.json({
        success: true,
        data: null,
      });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 500);
    }
  })
  // 7. 生成新邀请码 (限管理员)
  .post('/auth/invitations', authMiddleware, async (c) => {
    try {
      const user = c.get('user' as any) as any;
      if (user?.role !== 'admin' || !user.id) {
        return c.json({ success: false, error: 'Admin role required' }, 403);
      }

      const db = getDb(c.env.DB);

      // 生成格式如 INV-XXXX-XXXX 的邀请码
      const genSeg = () => Math.random().toString(36).substring(2, 6).toUpperCase();
      const code = `INV-${genSeg()}-${genSeg()}`;

      await db
        .insertInto('invitation_codes')
        .values({
          code,
          created_by: user.id,
          status: 'pending',
          created_at: Math.floor(Date.now() / 1000),
        })
        .execute();

      return c.json({
        success: true,
        data: {
          code,
          created_at: Math.floor(Date.now() / 1000),
          status: 'pending',
        },
      });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 500);
    }
  })
  // 8. 获取邀请码列表 (限管理员)
  .get('/auth/invitations', authMiddleware, async (c) => {
    try {
      const user = c.get('user' as any) as any;
      if (user?.role !== 'admin') {
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

      return c.json({
        success: true,
        data: list,
      });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 500);
    }
  })
  // 9. 废销未使用的邀请码 (限管理员)
  .delete('/auth/invitations/:code', authMiddleware, async (c) => {
    try {
      const user = c.get('user' as any) as any;
      if (user?.role !== 'admin') {
        return c.json({ success: false, error: 'Admin role required' }, 403);
      }

      const code = c.req.param('code');
      const db = getDb(c.env.DB);

      await db
        .deleteFrom('invitation_codes')
        .where('code', '=', code)
        .where('status', '=', 'pending')
        .execute();

      return c.json({
        success: true,
        data: null,
      });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 500);
    }
  });

export { authRouter };
