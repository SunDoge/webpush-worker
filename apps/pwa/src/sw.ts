/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

import { db } from './lib/db';

declare let self: ServiceWorkerGlobalScope;

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// self.__WB_MANIFEST is the default injection point
precacheAndRoute(self.__WB_MANIFEST);

// clean old assets
cleanupOutdatedCaches();

let allowlist: RegExp[] | undefined;
// in dev mode, we disable precaching to avoid caching issues
if (import.meta.env.DEV) allowlist = [/^\/$/];

// to allow work offline
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { allowlist }));

// 监听 Push 推送事件
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || '通知推送';

    // 根据优先级生成震动模式
    let _vibratePattern = [100];
    if (data.priority >= 4) {
      _vibratePattern = [300, 100, 300, 100, 300]; // 紧急震动
    } else if (data.priority === 3) {
      _vibratePattern = [200, 100, 200];
    }

    const options: NotificationOptions = {
      body: data.body || '',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: {
        url: data.url || '',
      },
      tag: data.id || undefined,
    };

    const savePromise = db.notifications
      .put({
        id: data.id || crypto.randomUUID(),
        title: title,
        body: data.body || '',
        url: data.url || '',
        priority: Number(data.priority) || 3,
        tags: data.tags || '',
        topic: data.topic || 'default',
        created_at: Number(data.created_at) || Math.floor(Date.now() / 1000),
      })
      .catch((err) => console.error('Failed to save push to Dexie:', err));

    event.waitUntil(Promise.all([self.registration.showNotification(title, options), savePromise]));
  } catch (err) {
    console.error('解析推送数据失败，展示后备文本:', err);
    const text = event.data.text();
    const fallbackId = crypto.randomUUID();

    const savePromise = db.notifications
      .put({
        id: fallbackId,
        title: '收到新消息',
        body: text,
        priority: 3,
        topic: 'default',
        created_at: Math.floor(Date.now() / 1000),
      })
      .catch((e) => console.error('Failed to save fallback push to Dexie:', e));

    event.waitUntil(
      Promise.all([
        self.registration.showNotification('收到新消息', {
          body: text,
          icon: '/favicon.svg',
          badge: '/favicon.svg',
        }),
        savePromise,
      ]),
    );
  }
});

// 监听通知点击事件
self.addEventListener('notificationclick', (event) => {
  event.notification.close(); // 点击后自动关闭通知

  const targetUrl = event.notification.data?.url;
  if (!targetUrl) return;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 如果已经有相同 URL 的页面打开，则直接聚焦
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          return (client as WindowClient).focus();
        }
      }
      // 否则打开新窗口
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});
