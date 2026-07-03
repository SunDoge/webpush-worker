/**
 * Auth router — mounted at /api/auth by the root app.
 *
 * Sub-modules:
 *   session.ts     — setup-status, register, login, refresh
 *   tokens.ts      — API token CRUD
 *   invitations.ts — invitation code management (admin only)
 */
import { Hono } from 'hono';
import type { PublicEnv } from '../../types';
import { invitationsRouter } from './invitations';
import { sessionRouter } from './session';
import { tokensRouter } from './tokens';

const authRouter = new Hono<PublicEnv>()
  .route('/', sessionRouter)
  .route('/', tokensRouter)
  .route('/', invitationsRouter);

export { authRouter };
