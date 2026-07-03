import { sValidator } from '@hono/standard-validator';
import { createFactory } from 'hono/factory';
import { verify } from 'hono/jwt';
import { getDb } from '../db';
import { loginSchema, refreshSchema, registerSchema } from '../schemas';
import type { PublicEnv } from '../types';
import { issueTokenPair } from '../utils/jwt';
import { hashPassword, verifyPassword } from '../utils/password';
import { verifyTurnstile } from '../utils/turnstile';

const factory = createFactory<PublicEnv>();

export const getSetupStatus = factory.createHandlers(async (c) => {
  const { db } = getDb(c.env.DB);
  const result = await db
    .selectFrom('users')
    .select((eb) => eb.fn.count<number>('id').as('count'))
    .executeTakeFirst();

  return c.json({
    code: 'ok' as const,
    data: {
      hasUsers: (result?.count ?? 0) > 0,
      turnstileSiteKey: c.env.TURNSTILE_SITE_KEY || null,
    },
  });
});

export const registerUser = factory.createHandlers(
  sValidator('json', registerSchema),
  async (c) => {
    const { db, dialect } = getDb(c.env.DB);
    const { username, password, code, turnstileToken } = c.req.valid('json') as any;

    const ip = c.req.header('CF-Connecting-IP');
    const isHuman = await verifyTurnstile(turnstileToken, c.env.TURNSTILE_SECRET_KEY, ip);
    if (!isHuman) {
      return c.json(
        { code: 'turnstile_failed' as const, msg: 'Turnstile verification failed' },
        400,
      );
    }

    const existing = await db
      .selectFrom('users')
      .select('id')
      .where('username', '=', username)
      .executeTakeFirst();

    if (existing) {
      return c.json({ code: 'user_already_exists' as const, msg: 'Username already exists' }, 400);
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
        return c.json(
          { code: 'invitation_invalid' as const, msg: 'Invitation code is required to register' },
          400,
        );
      }

      const inv = await db
        .selectFrom('invitation_codes')
        .select('code')
        .where('code', '=', code)
        .where('status', '=', 'pending')
        .executeTakeFirst();

      if (!inv) {
        return c.json(
          { code: 'invitation_invalid' as const, msg: 'Invalid or already used invitation code' },
          400,
        );
      }
      matchedCode = inv.code;
    }

    const passwordHash = await hashPassword(password);
    const userId = crypto.randomUUID();
    const createdAt = Math.floor(Date.now() / 1000);

    const q1 = db
      .insertInto('users')
      .values({ id: userId, username, password_hash: passwordHash, role, created_at: createdAt });

    const q2 = db
      .insertInto('user_topics')
      .values({ user_id: userId, name: 'default', created_at: createdAt });

    const queries = [q1.compile(), q2.compile()];

    if (matchedCode) {
      const q3 = db
        .updateTable('invitation_codes')
        .set({ status: 'used' as const, used_by: userId, used_at: createdAt })
        .where('code', '=', matchedCode);
      queries.push(q3.compile());
    }

    await dialect.batch(queries);

    const jwtSecret = c.env.JWT_SECRET;
    if (!jwtSecret) {
      return c.json(
        { code: 'server_misconfiguration' as const, msg: 'Server misconfiguration' },
        500,
      );
    }

    const tokens = await issueTokenPair({ id: userId, username, role }, jwtSecret);

    return c.json({
      code: 'ok' as const,
      data: {
        user: { id: userId, username, role, created_at: createdAt },
        ...tokens,
      },
    });
  },
);

export const loginUser = factory.createHandlers(sValidator('json', loginSchema), async (c) => {
  const { db } = getDb(c.env.DB);
  const { username, password, turnstileToken } = c.req.valid('json') as any;

  const ip = c.req.header('CF-Connecting-IP');
  const isHuman = await verifyTurnstile(turnstileToken, c.env.TURNSTILE_SECRET_KEY, ip);
  if (!isHuman) {
    return c.json({ code: 'turnstile_failed' as const, msg: 'Turnstile verification failed' }, 400);
  }

  const user = await db
    .selectFrom('users')
    .selectAll()
    .where('username', '=', username)
    .executeTakeFirst();

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.json({ code: 'unauthorized' as const, msg: 'Invalid username or password' }, 401);
  }

  const jwtSecret = c.env.JWT_SECRET;
  if (!jwtSecret) {
    return c.json(
      { code: 'server_misconfiguration' as const, msg: 'Server misconfiguration' },
      500,
    );
  }

  const tokens = await issueTokenPair(
    { id: user.id, username: user.username, role: user.role },
    jwtSecret,
  );

  return c.json({
    code: 'ok' as const,
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
});

export const refreshToken = factory.createHandlers(sValidator('json', refreshSchema), async (c) => {
  const { refreshToken: clientToken } = c.req.valid('json') as any;
  const jwtSecret = c.env.JWT_SECRET;
  if (!jwtSecret) {
    return c.json(
      { code: 'server_misconfiguration' as const, msg: 'Server misconfiguration' },
      500,
    );
  }

  let payload: any;
  try {
    payload = await verify(clientToken, jwtSecret, 'HS256');
  } catch {
    return c.json({ code: 'unauthorized' as const, msg: 'Invalid or expired refresh token' }, 401);
  }

  if (!payload.is_refresh_token) {
    return c.json({ code: 'invalid_params' as const, msg: 'Not a valid refresh token' }, 400);
  }

  const tokens = await issueTokenPair(
    { id: payload.id, username: payload.username, role: payload.role },
    jwtSecret,
  );

  return c.json({ code: 'ok' as const, data: tokens });
});
