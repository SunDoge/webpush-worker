import type { AppType } from '@webpush-worker/api';
import { hc } from 'hono/client';
import { db } from './db';

let stateInstance: WebPushState | null = null;

export const client = hc<AppType>(
  typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
  {
    fetch: async (url: any, options: any) => {
      let res = await fetch(url, options);

      // 如果接口返回 401 且有可用的 Refresh Token，则尝试自动刷新 Token
      if (res.status === 401 && stateInstance && stateInstance.refreshToken) {
        // 避免 /auth/refresh 接口本身失效时产生死循环
        if (url.toString().includes('/auth/refresh')) {
          return res;
        }

        const refreshed = await stateInstance.refreshAccessToken();
        if (refreshed) {
          // 重建 Headers 并替换 Authorization 头
          if (options?.headers) {
            const headers = new Headers(options.headers);
            headers.set('Authorization', `Bearer ${stateInstance.sessionToken}`);
            options.headers = headers;
          }
          // 重新发起之前失败的请求
          res = await fetch(url, options);
        }
      }
      return res;
    },
  },
);

export class WebPushState {
  // Config state (stored in localStorage)

  // sessionToken: 登录后的短期 JWT（15min），仅用于 API 请求鉴权，不对外暴露
  sessionToken = $state(localStorage.getItem('webpush_session_token') || '');
  refreshToken = $state(localStorage.getItem('webpush_refresh_token') || '');

  // apiToken: 用户手动填写的长期 wpt_ Token，用于 CURL 命令展示和外部集成
  apiToken = $state(localStorage.getItem('webpush_api_token') || '');

  deviceName = $state(localStorage.getItem('webpush_device_name') || 'My Mobile Browser');
  topics = $state(localStorage.getItem('webpush_topics') || 'default');
  selectedTopics = $state<string[]>([]);

  currentTab = $state(localStorage.getItem('webpush_current_tab') || 'subscribe'); // 'subscribe' | 'send' | 'curl' | 'history'

  // Push status state
  permission = $state('default'); // 'default' | 'granted' | 'denied'
  subscriptionJson = $state<string | null>(null);
  localEndpoint = $state<string | null>(null);
  isRegisteredOnServer = $state(false);
  devicesList = $state<any[]>([]);
  historyList = $state<any[]>([]);
  apiTokensList = $state<any[]>([]);
  invitationCodesList = $state<any[]>([]);
  userTopics = $state<any[]>([]);

  // Send form state
  sendTopic = $state('default');
  sendTitle = $state('');
  sendBody = $state('');
  sendUrl = $state('');
  sendPriority = $state(3); // 1-5
  sendTags = $state('');
  isSending = $state(false);
  sendStatus = $state({ success: false, message: '' });

  // User Authentication State
  user = $state<{ id: string | null; username: string; role: string; created_at: number } | null>(
    null,
  );
  turnstileSiteKey = $state<string | null>(null);

  // Native mobile configuration
  themeMode = $state(localStorage.getItem('webpush_theme_mode') || 'ios'); // 'auto' | 'ios' | 'material'
  isIOS = $state(false);
  theme = $derived<'ios' | 'material'>(
    this.themeMode === 'ios'
      ? 'ios'
      : this.themeMode === 'material'
        ? 'material'
        : this.isIOS
          ? 'ios'
          : 'material',
  );

  // Global Toast / Notification State
  toastOpened = $state(false);
  toastMessage = $state('');
  dialogOpened = $state(false);
  dialogTitle = $state('');
  dialogMessage = $state('');
  dialogConfirmCallback = $state<(() => void) | null>(null);

  private toastTimeout: any = null;

  // VAPID key
  vapidPublicKey = $state(localStorage.getItem('webpush_vapid_public_key') || '');

  // 当前请求使用的 Bearer token：优先用 sessionToken，没有时 fallback 到 apiToken
  get authToken(): string {
    return this.sessionToken || this.apiToken;
  }

  constructor() {
    stateInstance = this;

    // Watch and persist changes
    $effect(() => {
      localStorage.setItem('webpush_session_token', this.sessionToken);
    });
    $effect(() => {
      localStorage.setItem('webpush_refresh_token', this.refreshToken);
    });
    $effect(() => {
      localStorage.setItem('webpush_api_token', this.apiToken);
      // 当手动改了 apiToken 时，清理旧的 VAPID 公钥缓存，以保证重新获取新后端的公钥
      this.vapidPublicKey = '';
      localStorage.removeItem('webpush_vapid_public_key');
      // 当手动改了 apiToken 但还未登录时，尝试刷新数据
      if (this.apiToken && !this.sessionToken) {
        this.refreshData();
      }
    });
    $effect(() => {
      localStorage.setItem('webpush_device_name', this.deviceName);
    });
    $effect(() => {
      localStorage.setItem('webpush_topics', this.topics);
    });
    $effect(() => {
      localStorage.setItem('webpush_current_tab', this.currentTab);
    });
    $effect(() => {
      localStorage.setItem('webpush_theme_mode', this.themeMode);
    });
    // Sync selectedTopics to topics string
    $effect(() => {
      this.topics = this.selectedTopics.join(',');
    });
  }

  showToast(message: string) {
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
    this.toastMessage = message;
    this.toastOpened = true;
    this.toastTimeout = setTimeout(() => {
      this.toastOpened = false;
    }, 3000);
  }

  showDialog(title: string, message: string) {
    this.dialogTitle = title;
    this.dialogMessage = message;
    this.dialogConfirmCallback = null;
    this.dialogOpened = true;
  }

  showConfirm(title: string, message: string, onConfirm: () => void) {
    this.dialogTitle = title;
    this.dialogMessage = message;
    this.dialogConfirmCallback = onConfirm;
    this.dialogOpened = true;
  }

  // Parse JWT token on PWA client to restore session
  decodeUserFromToken(token: string) {
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payloadDecoded = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
        const payload = JSON.parse(payloadDecoded);
        if (payload.exp && payload.exp > Math.floor(Date.now() / 1000)) {
          this.user = {
            id: payload.id,
            username: payload.username,
            role: payload.role,
            created_at: payload.created_at || 0,
          };
          return;
        }
      }
    } catch (_e) {
      // Ignore parse errors (non-JWT raw tokens)
    }
    this.user = null;
  }

  // Convert Base64 URL back to Uint8Array for VAPID subscription
  private urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // Helper to safely get or register Service Worker
  async getSWRegistration(): Promise<ServiceWorkerRegistration> {
    if (!window.isSecureContext) {
      throw new Error(
        '当前页面非安全上下文（Service Worker 要求使用 HTTPS 或 localhost/127.0.0.1 访问）。如果您正在使用局域网 IP（如 192.168.x.x）进行测试，请改用 localhost 访问，或通过配置 HTTPS 证书、使用内网穿透（如 ngrok）以及设置 Chrome flags 豁免该 IP。',
      );
    }

    if (!('serviceWorker' in navigator)) {
      throw new Error('此浏览器不支持 Service Worker');
    }

    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      if (registrations.length > 0) {
        return registrations[0];
      }

      const readyPromise = navigator.serviceWorker.ready;
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 2000),
      );
      return await Promise.race([readyPromise, timeoutPromise]);
    } catch (err: any) {
      const errMsg = err.message || '';
      if (
        err.name === 'SecurityError' ||
        errMsg.includes('insecure') ||
        errMsg.includes('SecurityError')
      ) {
        throw new Error(
          '无法激活推送服务: 浏览器安全策略限制。如果您正在使用"无痕模式/隐私窗口"，或者浏览器设置了"阻止所有 Cookie/第三方网站数据"，浏览器将禁用 Service Worker。请尝试使用普通窗口访问，并允许网站 Cookie 及本地存储。',
        );
      }

      console.warn('Service Worker ready state timed out, attempting manual registration...', err);
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          type: 'module',
        });
        console.log('Manual Service Worker registration successful:', registration);
        return registration;
      } catch (regErr: any) {
        console.error('Manual Service Worker registration failed:', regErr);
        const regMsg = regErr.message || '';
        if (
          regErr.name === 'SecurityError' ||
          regMsg.includes('insecure') ||
          regMsg.includes('SecurityError')
        ) {
          throw new Error(
            '无法激活推送服务: 浏览器安全策略限制。如果您正在使用"无痕模式/隐私窗口"，或者浏览器设置了"阻止所有 Cookie/第三方网站数据"，浏览器将禁用 Service Worker。请尝试使用普通窗口访问，并允许网站 Cookie 及本地存储。',
          );
        }
        throw new Error(`无法激活推送服务: ${regErr.message || 'Service Worker 注册失败'}`);
      }
    }
  }

  async init() {
    // Detect OS theme
    this.isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if ('Notification' in window) {
      this.permission = Notification.permission;
    }

    // Restore selected topics array from local storage
    const savedTopics = localStorage.getItem('webpush_topics') || 'default';
    this.selectedTopics = savedTopics
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    // Restore user session from cached sessionToken if valid
    if (this.sessionToken) {
      this.decodeUserFromToken(this.sessionToken);
    }

    // Load cached notifications immediately from IndexedDB
    await this.loadHistoryFromDexie();

    await this.checkLocalSubscription();
    if (this.authToken) {
      await this.refreshData();
    }
  }

  async refreshData() {
    await this.fetchDevices();
    await this.loadHistoryFromDexie();
    if (this.user) {
      await this.fetchApiTokens();
      await this.fetchTopics();
      if (this.user.role === 'admin') {
        await this.fetchInvitationCodes();
      }
    }
  }

  // Check if this browser already has a registration
  async checkLocalSubscription() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return;
    }
    try {
      const registration = await this.getSWRegistration();
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        this.subscriptionJson = JSON.stringify(sub);
        this.localEndpoint = sub.endpoint;
        this.checkServerRegistration();
      } else {
        this.subscriptionJson = null;
        this.localEndpoint = null;
        this.isRegisteredOnServer = false;
      }
    } catch (err) {
      console.error('检查本地订阅状态失败:', err);
    }
  }

  checkServerRegistration() {
    if (!this.localEndpoint || this.devicesList.length === 0) {
      this.isRegisteredOnServer = false;
      return;
    }
    this.isRegisteredOnServer = this.devicesList.some((d) => d.endpoint === this.localEndpoint);
  }

  async requestPermission() {
    if (!('Notification' in window)) {
      this.showDialog('通知失败', '此浏览器不支持桌面通知');
      return;
    }
    const result = await Notification.requestPermission();
    this.permission = result;
  }

  async subscribeDevice() {
    try {
      if (this.permission !== 'granted') {
        await this.requestPermission();
      }
      if (this.permission !== 'granted') {
        this.showDialog('提示', '⚠️ 无法注册推送：通知权限未被批准！');
        return;
      }

      const registration = await this.getSWRegistration();
      let sub = await registration.pushManager.getSubscription();

      if (!sub) {
        let pubKey = this.vapidPublicKey;
        if (!pubKey) {
          pubKey = await this.fetchVapidPublicKey();
        }
        if (!pubKey) {
          this.showDialog('提示', '⚠️ 无法获取 VAPID 公钥，请检查后端配置！');
          return;
        }

        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: this.urlBase64ToUint8Array(pubKey),
        });
      }

      this.subscriptionJson = JSON.stringify(sub);
      this.localEndpoint = sub.endpoint;

      const subJson = sub.toJSON();
      const hashedId = btoa(sub.endpoint).replace(/=/g, '').slice(-16);

      const res = await client.api.subscribe.$post(
        {
          json: {
            id: hashedId,
            name: this.deviceName,
            endpoint: sub.endpoint,
            subscription: {
              endpoint: sub.endpoint,
              keys: {
                p256dh: subJson.keys?.p256dh || '',
                auth: subJson.keys?.auth || '',
              },
            },
            topics: this.topics,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.authToken}`,
          },
        },
      );

      const data = await res.json();
      if (res.ok && data.success) {
        this.isRegisteredOnServer = true;
        this.showToast('🎉 设备订阅注册成功！');
        await this.refreshData();
      } else {
        this.showDialog('订阅失败', `❌ 服务器端订阅失败: ${this.formatError(data)}`);
      }
    } catch (err: any) {
      console.error('订阅出错:', err);
      // 清理缓存，以保证下一次重试时重新拉取最新的公钥
      this.vapidPublicKey = '';
      localStorage.removeItem('webpush_vapid_public_key');
      this.showDialog('订阅异常', `❌ 订阅发生异常: ${err.message}`);
    }
  }

  async unsubscribeDevice() {
    if (!this.localEndpoint) return;

    this.showConfirm('注销设备', '确定要注销此设备的推送通知吗？', async () => {
      try {
        const res = await client.api.unsubscribe.$post(
          {
            json: { endpoint: this.localEndpoint! },
          },
          {
            headers: {
              Authorization: `Bearer ${this.authToken}`,
            },
          },
        );

        const data = await res.json();
        if (res.ok && data.success) {
          const registration = await this.getSWRegistration();
          const sub = await registration.pushManager.getSubscription();
          if (sub) {
            await sub.unsubscribe();
          }

          this.subscriptionJson = null;
          this.localEndpoint = null;
          this.isRegisteredOnServer = false;

          this.showToast('👋 设备注销成功！');
          await this.refreshData();
        } else {
          this.showDialog('注销失败', `❌ 服务器端注销失败: ${this.formatError(data)}`);
        }
      } catch (err: any) {
        console.error('注销出错:', err);
        this.showDialog('注销异常', `❌ 注销发生异常: ${err.message}`);
      }
    });
  }

  async fetchDevices() {
    if (!this.authToken) return;
    try {
      const res = await client.api.devices.$get(undefined, {
        headers: {
          Authorization: `Bearer ${this.authToken}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          this.devicesList = data.data || [];
          this.checkServerRegistration();
        }
      }
    } catch (err) {
      console.error('获取设备列表失败:', err);
    }
  }

  async loadHistoryFromDexie() {
    try {
      this.historyList = await db.notifications.orderBy('created_at').reverse().limit(50).toArray();
    } catch (err) {
      console.error('Failed to load history from Dexie:', err);
    }
  }

  async triggerPush() {
    if (!this.sendBody) return;

    this.isSending = true;
    this.sendStatus = { success: false, message: '' };

    try {
      const res = await client.api.send.$post(
        {
          query: { topic: this.sendTopic },
          json: {
            title: this.sendTitle || undefined,
            body: this.sendBody,
            url: this.sendUrl || undefined,
            priority: this.sendPriority,
            tags: this.sendTags || undefined,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.authToken}`,
          },
        },
      );

      const data = await res.json();
      if (res.ok && data.success) {
        this.sendStatus = {
          success: true,
          message: `🚀 已成功投递给 ${data.data.successCount} 台设备（失败: ${data.data.failCount}）。`,
        };

        // Save the sent notification locally in Dexie IndexedDB
        const sentId = data.data.id || crypto.randomUUID();
        await db.notifications
          .put({
            id: sentId,
            title: this.sendTitle,
            body: this.sendBody,
            url: this.sendUrl,
            priority: this.sendPriority,
            tags: this.sendTags,
            topic: this.sendTopic,
            created_at: Math.floor(Date.now() / 1000),
          })
          .catch((err) => console.error('Failed to save sent notification to Dexie:', err));

        this.sendTitle = '';
        this.sendBody = '';
        this.sendUrl = '';
        this.sendTags = '';
        await this.loadHistoryFromDexie();
      } else {
        this.showDialog('发送失败', `❌ 发送失败: ${this.formatError(data)}`);
      }
    } catch (err: any) {
      this.sendStatus = { success: false, message: `❌ 发送异常: ${err.message}` };
    } finally {
      this.isSending = false;
    }
  }

  // Helper to format API errors
  formatError(data: any): string {
    if (!data) return '未知错误';
    if (data.error) {
      if (Array.isArray(data.error)) {
        return data.error.map((e: any) => e.message || '输入格式错误').join(', ');
      }
      return String(data.error);
    }
    return '未知错误';
  }

  async login(username: string, password: string, turnstileToken?: string) {
    try {
      const res = await client.api.auth.login.$post({
        json: { username, password, turnstileToken },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        this.sessionToken = data.data.token; // JWT，仅用于 API 请求
        this.refreshToken = data.data.refreshToken;
        this.user = data.data.user;
        this.showToast('🎉 登录成功！');
        await this.refreshData();
        return { success: true };
      } else {
        const errMsg = this.formatError(data);
        this.showDialog('登录失败', `❌ 登录失败: ${errMsg}`);
        return { success: false, error: errMsg };
      }
    } catch (err: any) {
      console.error('Login error:', err);
      this.showDialog('登录异常', `❌ 登录发生异常: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async register(username: string, password: string, code?: string, turnstileToken?: string) {
    try {
      const res = await client.api.auth.register.$post({
        json: { username, password, code: code || undefined, turnstileToken },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        this.sessionToken = data.data.token; // JWT，仅用于 API 请求
        this.refreshToken = data.data.refreshToken;
        this.user = data.data.user;
        this.showToast('🎉 注册成功并已自动登录！');
        await this.refreshData();
        return { success: true };
      } else {
        const errMsg = this.formatError(data);
        this.showDialog('注册失败', `❌ 注册失败: ${errMsg}`);
        return { success: false, error: errMsg };
      }
    } catch (err: any) {
      console.error('Register error:', err);
      this.showDialog('注册异常', `❌ 注册发生异常: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  logout() {
    this.sessionToken = '';
    this.refreshToken = '';
    this.apiToken = '';
    this.vapidPublicKey = '';
    localStorage.removeItem('webpush_vapid_public_key');
    this.user = null;
    this.apiTokensList = [];
    this.invitationCodesList = [];
    this.userTopics = [];
    this.showToast('👋 已退出登录！');
  }

  async fetchVapidPublicKey(): Promise<string> {
    try {
      const res = await client.api['vapid-public-key'].$get();
      const data = await res.json();
      if (res.ok && data.success && data.data.publicKey) {
        this.vapidPublicKey = data.data.publicKey;
        localStorage.setItem('webpush_vapid_public_key', this.vapidPublicKey);
        return this.vapidPublicKey;
      }
    } catch (err) {
      console.error('获取 VAPID 公钥失败:', err);
    }
    return '';
  }

  async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshToken) return false;
    try {
      const res = await client.api.auth.refresh.$post({
        json: { refreshToken: this.refreshToken },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        this.sessionToken = data.data.token;
        this.refreshToken = data.data.refreshToken;
        this.decodeUserFromToken(this.sessionToken);
        console.log('🔄 Access Token refreshed successfully.');
        return true;
      } else {
        console.warn('🔄 Token refresh failed, logging out user.');
        this.logout();
        return false;
      }
    } catch (err) {
      console.error('🔄 Token refresh error:', err);
      this.logout();
      return false;
    }
  }

  async fetchApiTokens() {
    if (!this.authToken || !this.user) return;
    try {
      const res = await client.api.auth.tokens.$get(undefined, {
        headers: {
          Authorization: `Bearer ${this.authToken}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          this.apiTokensList = data.data || [];
        }
      }
    } catch (err) {
      console.error('获取 API Token 列表失败:', err);
    }
  }

  async generateApiToken(name: string) {
    try {
      const res = await client.api.auth.token.$post(
        {
          json: { name },
        },
        {
          headers: {
            Authorization: `Bearer ${this.authToken}`,
          },
        },
      );
      const data = await res.json();
      if (res.ok && data.success) {
        await this.fetchApiTokens();
        this.showToast('🎉 Token 生成成功！');
        return { success: true, token: data.data.token };
      } else {
        const errMsg = this.formatError(data);
        this.showDialog('生成失败', `❌ 生成 Token 失败: ${errMsg}`);
        return { success: false, error: errMsg };
      }
    } catch (err: any) {
      console.error('Generate token error:', err);
      this.showDialog('生成异常', `❌ 生成 Token 异常: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async revokeApiToken(id: string) {
    this.showConfirm(
      '注销 Token',
      '确定要注销此 API Token 吗？使用该 Token 的外部集成将全部失效！',
      async () => {
        try {
          const res = await client.api.auth.tokens[':id'].$delete(
            {
              param: { id },
            },
            {
              headers: {
                Authorization: `Bearer ${this.authToken}`,
              },
            },
          );
          const data = await res.json();
          if (res.ok && data.success) {
            this.showToast('🎉 Token 已注销！');
            await this.fetchApiTokens();
          } else {
            const errMsg = this.formatError(data);
            this.showDialog('注销失败', `❌ 注销失败: ${errMsg}`);
          }
        } catch (err: any) {
          console.error('Revoke token error:', err);
          this.showDialog('注销异常', `❌ 注销异常: ${err.message}`);
        }
      },
    );
  }

  async fetchInvitationCodes() {
    if (!this.authToken || !this.user || this.user.role !== 'admin') return;
    try {
      const res = await client.api.auth.invitations.$get(undefined, {
        headers: {
          Authorization: `Bearer ${this.authToken}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          this.invitationCodesList = data.data || [];
        }
      }
    } catch (err) {
      console.error('获取邀请码列表失败:', err);
    }
  }

  async generateInvitationCode() {
    try {
      const res = await client.api.auth.invitations.$post(undefined, {
        headers: {
          Authorization: `Bearer ${this.authToken}`,
        },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await this.fetchInvitationCodes();
        this.showToast('🎉 邀请码生成成功！');
      } else {
        const errMsg = this.formatError(data);
        this.showDialog('生成失败', `❌ 生成邀请码失败: ${errMsg}`);
      }
    } catch (err: any) {
      console.error('Generate invitation code error:', err);
      this.showDialog('生成异常', `❌ 生成邀请码异常: ${err.message}`);
    }
  }

  async revokeInvitationCode(code: string) {
    this.showConfirm('废销邀请码', '确定要废销此邀请码吗？', async () => {
      try {
        const res = await client.api.auth.invitations[':code'].$delete(
          {
            param: { code },
          },
          {
            headers: {
              Authorization: `Bearer ${this.authToken}`,
            },
          },
        );
        const data = await res.json();
        if (res.ok && data.success) {
          this.showToast('🎉 邀请码已废销！');
          await this.fetchInvitationCodes();
        } else {
          const errMsg = this.formatError(data);
          this.showDialog('废销失败', `❌ 废销失败: ${errMsg}`);
        }
      } catch (err: any) {
        console.error('Revoke invitation code error:', err);
        this.showDialog('废销异常', `❌ 废销异常: ${err.message}`);
      }
    });
  }

  async fetchTopics() {
    if (!this.authToken || !this.user) return;
    try {
      const res = await client.api.topics.$get(undefined, {
        headers: {
          Authorization: `Bearer ${this.authToken}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          this.userTopics = data.data || [];
        }
      }
    } catch (err) {
      console.error('获取主题列表失败:', err);
    }
  }

  async createTopic(name: string) {
    if (!name.trim()) return false;
    try {
      const res = await client.api.topics.$post(
        {
          json: { name },
        },
        {
          headers: {
            Authorization: `Bearer ${this.authToken}`,
          },
        },
      );
      const data = await res.json();
      if (res.ok && data.success) {
        this.showToast('🎉 主题创建成功！');
        await this.fetchTopics();
        return true;
      } else {
        const errMsg = this.formatError(data);
        this.showDialog('创建失败', `❌ 创建主题失败: ${errMsg}`);
        return false;
      }
    } catch (err: any) {
      console.error('Create topic error:', err);
      this.showDialog('创建异常', `❌ 创建主题异常: ${err.message}`);
      return false;
    }
  }

  async deleteTopic(name: string) {
    if (name === 'default') {
      this.showDialog('提示', '⚠️ 无法删除默认主题 default！');
      return;
    }
    this.showConfirm(
      '删除主题',
      `确定要删除主题 "${name}" 吗？该操作会导致所有设备自动退订该主题！`,
      async () => {
        try {
          const res = await client.api.topics[':name'].$delete(
            {
              param: { name },
            },
            {
              headers: {
                Authorization: `Bearer ${this.authToken}`,
              },
            },
          );
          const data = await res.json();
          if (res.ok && data.success) {
            this.showToast(`🎉 主题 "${name}" 已成功删除！`);
            this.selectedTopics = this.selectedTopics.filter((t) => t !== name);
            await this.fetchTopics();
          } else {
            const errMsg = this.formatError(data);
            this.showDialog('删除失败', `❌ 删除主题失败: ${errMsg}`);
          }
        } catch (err: any) {
          console.error('Delete topic error:', err);
          this.showDialog('删除异常', `❌ 删除主题异常: ${err.message}`);
        }
      },
    );
  }
}
