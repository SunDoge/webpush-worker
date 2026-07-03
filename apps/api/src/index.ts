/// <reference path="../worker-configuration.d.ts" />

import { Hono } from 'hono';
// Import all handlers
import * as deviceHandler from './handlers/device';
import * as invitationsHandler from './handlers/invitations';
import * as pushHandler from './handlers/push';
import * as sessionHandler from './handlers/session';
import * as tokensHandler from './handlers/tokens';
import * as topicsHandler from './handlers/topics';
import * as vapidHandler from './handlers/vapid';
import { authMiddleware } from './middleware/auth';
import type { AuthEnv, PublicEnv } from './types';

const app = new Hono<PublicEnv>();

app.onError((err, c) => {
  console.error('[Unhandled Error]', err);
  return c.json(
    {
      code: 'internal_server_error',
      msg: 'Internal server error',
    },
    500,
  );
});

// Auth session routes (Public)
const sessionRouter = new Hono<PublicEnv>()
  .get('/setup-status', ...sessionHandler.getSetupStatus)
  .post('/register', ...sessionHandler.registerUser)
  .post('/login', ...sessionHandler.loginUser)
  .post('/refresh', ...sessionHandler.refreshToken);

// Auth tokens / invitations routes (Private)
const authRouter = new Hono<AuthEnv>()
  .use(authMiddleware)
  .post('/token', ...tokensHandler.createToken)
  .get('/tokens', ...tokensHandler.listTokens)
  .delete('/tokens/:id', ...tokensHandler.revokeToken)
  .post('/invitations', ...invitationsHandler.createInvitation)
  .get('/invitations', ...invitationsHandler.listInvitations)
  .delete('/invitations/:code', ...invitationsHandler.revokeInvitation);

// Device routes (Private)
const deviceRouter = new Hono<AuthEnv>()
  .use(authMiddleware)
  .get('/', ...deviceHandler.listDevices)
  .post('/subscribe', ...deviceHandler.subscribeDevice)
  .delete('/:id', ...deviceHandler.deleteDevice);

// Push routes (Private)
const pushRouter = new Hono<AuthEnv>().use(authMiddleware).post('/:topic', ...pushHandler.sendPush);

// Topic routes (Private)
const topicsRouter = new Hono<AuthEnv>()
  .use(authMiddleware)
  .get('/', ...topicsHandler.listTopics)
  .post('/', ...topicsHandler.createTopic)
  .delete('/:name', ...topicsHandler.deleteTopic);

const routes = app
  .get('/api/vapid', ...vapidHandler.getVapidPublicKey)
  .route('/api/auth', sessionRouter)
  .route('/api/auth', authRouter)
  .route('/api/devices', deviceRouter)
  .route('/api/push', pushRouter)
  .route('/api/topics', topicsRouter);

export type AppType = typeof routes;
export default app;
