/**
 * Auth session routes — mounted at /api/auth by the root app.
 *
 * GET  /api/auth/setup-status   — first-run detection
 * POST /api/auth/register       — user registration
 * POST /api/auth/login          — issue access + refresh tokens
 * POST /api/auth/refresh        — rotate tokens via refresh token
 */
import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';
import type { Handler } from 'hono';
import { verify } from 'hono/jwt';
import { getDb } from '../../db';
import { loginSchema, refreshSchema, registerSchema } from '../../schemas';
import type { PublicEnv } from '../../types';
import { serverError } from '../../utils/error';
import { issueTokenPair } from '../../utils/jwt';
import { hashPassword, verifyPassword } from '../../utils/password';
import { verifyTurnstile } from '../../utils/turnstile';

const getSetupStatus = (async (c) => {
  try {
    const db = getDb(c.env.DB);
    const result = await db
      .selectFrom('users')
      .select((eb) => eb.fn.count<number>('id').as('count'))
      .executeTakeFirst();

    return c.json({
      success: true,
      data: {
        hasUsers: (result?.count ?? 0) > 0,
        turnstileSiteKey: c.env.TURNSTILE_SITE_KEY || null,
      },
    });
  } catch (err) {
    return serverError(c, err);
  }
}) satisfies Handler<PublicEnv, '/setup-status'>;

const registerUser = (async (c) => {
  try {
    const db = getDb(c.env.DB);
    const { username, password, code, turnstileToken } = c.req.valid('json') as {
      username: string;
      password: string;
      code?: string;
      turnstileToken?: string;
    };

    const ip = c.req.header('CF-Connecting-IP');
    const isHuman = await verifyTurnstile(turnstileToken, c.env.TURNSTILE_SECRET_KEY, ip);
    if (!isHuman) {
      return c.json({ success: false, error: 'Turnstile verification failed' }, 400);
    }

    const existing = await db
      .selectFrom('users')
      .select('id')
      .where('username', '=', username)
      .executeTakeFirst();

    if (existing) {
      return c.json({ success: false, error: 'Username already exists' }, 400);
    }

    const countResult = await db
      .selectFrom('users')
      .select((eb) => eb.fn.count<number>('id').as('count'))
      .executeTakeFirst();

    const userCount = countResult?.count ?? 0;
    const role = userCount === 0 ? 'admin' : 'user';

    // Non-first users must supply a valid pending invitation code
    let matchedCode: string | null = null;
    if (userCount > 0) {
      if (!code) {
        return c.json({ success: false, error: 'Invitation code is required to register' }, 400);
      }

      const inv = await db
        .selectFrom('invitation_codes')
        .select('code')
        .where('code', '=', code)
        .where('status', '=', 'pending')
        .executeTakeFirst();

      if (!inv) {
        return c.json({ success: false, error: 'Invalid or already used invitation code' }, 400);
      }
      matchedCode = inv.code;
    }

    const passwordHash = await hashPassword(password);
    const userId = crypto.randomUUID();
    const createdAt = Math.floor(Date.now() / 1000);

    await db
      .insertInto('users')
      .values({ id: userId, username, password_hash: passwordHash, role, created_at: createdAt })
      .execute();

    // Every new user gets a built-in 'default' topic that cannot be deleted
    await db
      .insertInto('user_topics')
      .values({ user_id: userId, name: 'default', created_at: createdAt })
      .execute();

    if (matchedCode) {
      await db
        .updateTable('invitation_codes')
        .set({ status: 'used', used_by: userId, used_at: createdAt })
        .where('code', '=', matchedCode)
        .execute();
    }

    const jwtSecret = c.env.JWT_SECRET;
    if (!jwtSecret) {
      return c.json({ success: false, error: 'Server misconfiguration' }, 500);
    }

    const tokens = await issueTokenPair({ id: userId, username, role }, jwtSecret);

    return c.json({
      success: true,
      data: { user: { id: userId, username, role, created_at: createdAt }, ...tokens },
    });
  } catch (err) {
    return serverError(c, err);
  }
}) satisfies Handler<PublicEnv, '/register', any>;

const loginUser = (async (c) => {
  try {
    const db = getDb(c.env.DB);
    const { username, password, turnstileToken } = c.req.valid('json') as {
      username: string;
      password: string;
      turnstileToken?: string;
    };

    const ip = c.req.header('CF-Connecting-IP');
    const isHuman = await verifyTurnstile(turnstileToken, c.env.TURNSTILE_SECRET_KEY, ip);
    if (!isHuman) {
      return c.json({ success: false, error: 'Turnstile verification failed' }, 400);
    }

    const user = await db
      .selectFrom('users')
      .selectAll()
      .where('username', '=', username)
      .executeTakeFirst();

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return c.json({ success: false, error: 'Invalid username or password' }, 401);
    }

    const jwtSecret = c.env.JWT_SECRET;
    if (!jwtSecret) {
      return c.json({ success: false, error: 'Server misconfiguration' }, 500);
    }

    const tokens = await issueTokenPair(
      { id: user.id, username: user.username, role: user.role },
      jwtSecret,
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
        ...tokens,
      },
    });
  } catch (err) {
    return serverError(c, err);
  }
}) satisfies Handler<PublicEnv, '/login', any>;

const refreshToken = (async (c) => {
  try {
    const { refreshToken: clientToken } = c.req.valid('json') as { refreshToken: string };
    const jwtSecret = c.env.JWT_SECRET;
    if (!jwtSecret) {
      return c.json({ success: false, error: 'Server misconfiguration' }, 500);
    }

    let payload: any;
    try {
      payload = await verify(clientToken, jwtSecret, 'HS256');
    } catch {
      return c.json({ success: false, error: 'Invalid or expired refresh token' }, 401);
    }

    if (!payload.is_refresh_token) {
      return c.json({ success: false, error: 'Not a valid refresh token' }, 400);
    }

    const tokens = await issueTokenPair(
      { id: payload.id, username: payload.username, role: payload.role },
      jwtSecret,
    );

    return c.json({ success: true, data: tokens });
  } catch (err) {
    return serverError(c, err);
  }
}) satisfies Handler<PublicEnv, '/refresh', any>;

const sessionRouter = new Hono<PublicEnv>()
  .get('/setup-status', getSetupStatus)
  .post('/register', sValidator('json', registerSchema), registerUser)
  .post('/login', sValidator('json', loginSchema), loginUser)
  .post('/refresh', sValidator('json', refreshSchema), refreshToken);

export { sessionRouter };
