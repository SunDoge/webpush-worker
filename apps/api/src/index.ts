/// <reference path="../worker-configuration.d.ts" />

import { Hono } from 'hono';
import { authRouter } from './routes/auth';
// import { devicesRouter } from './routes/devices';
import { pushRouter } from './routes/push';
import { topicsRouter } from './routes/topics';
import * as deviceHandler from './handlers/device';
import { AuthEnv, PublicEnv } from './types';
import { getBunServer } from 'hono/bun';
import { authMiddleware } from './middleware/auth';
import { getVapidPublicKey } from './handlers/vapid';

const app = new Hono<PublicEnv>();

// Route map — each sub-router owns its prefix so paths never collide:
//
//   /api/auth/*        → authRouter
//   /api/devices/*     → devicesRouter
//   /api/push/:topic   → pushRouter
//   /api/topics/*      → topicsRouter

const deviceRouter = new Hono<PublicEnv>()
  .use(authMiddleware)
  .get('/', ...deviceHandler.listDevices)
  .post('/subscribe', ...deviceHandler.subscribeDevice)
  .delete('/:id', ...deviceHandler.deleteDevice);

const routes = app
  .get('/api/vapid', ...getVapidPublicKey)
  .route('/api/auth', authRouter)
  .route('/api/devices', deviceRouter)
  .route('/api/push', pushRouter)
  .route('/api/topics', topicsRouter);

export type AppType = typeof routes;
export default app;
