import { Hono } from 'hono';
import { authRouter } from './routes/auth';
import { devicesRouter } from './routes/devices';
import { pushRouter } from './routes/push';
import { topicsRouter } from './routes/topics';

const app = new Hono<{ Bindings: CloudflareBindings }>();

// CORS Middleware
// app.use(
//   '*',
//   cors({
//     origin: (origin) => origin, // 允许所有来源跨域，以便各种端点调用
//     allowHeaders: [
//       'Content-Type',
//       'Authorization',
//       'Title',
//       'Priority',
//       'Click',
//       'Tags',
//       'X-Token',
//     ],
//     allowMethods: ['POST', 'GET', 'OPTIONS', 'DELETE'],
//     exposeHeaders: ['Content-Length'],
//     maxAge: 600,
//     credentials: true,
//   }),
// );

// Mount sub-routers
const routes = app
  .route('/api', authRouter)
  .route('/api', devicesRouter)
  .route('/api', pushRouter)
  .route('/api', topicsRouter);

export type AppType = typeof routes;
export default app;
