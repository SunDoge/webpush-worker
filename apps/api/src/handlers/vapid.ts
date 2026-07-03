import { createFactory } from 'hono/factory';
import type { PublicEnv } from '../types';

const factory = createFactory<PublicEnv>();
export const getVapidPublicKey = factory.createHandlers((c) => {
  return c.json({ code: 'ok', data: { publickey: c.env.VAPID_PUBLIC_KEY } });
});
