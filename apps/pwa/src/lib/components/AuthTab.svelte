<script lang="ts">
import { loginSchema, registerSchema } from '@webpush-worker/shared';
import {
  Block,
  BlockTitle,
  Button,
  Card,
  List,
  ListInput,
  Segmented,
  SegmentedButton,
} from 'konsta/svelte';
import { onMount } from 'svelte';
import { safeParse } from 'valibot';
import { client, unwrap, type WebPushState } from '../webpush-state.svelte';

interface Props {
  appState: WebPushState;
}

let { appState }: Props = $props();

// Auth form state
let authUsername = $state('');
let authPassword = $state('');
let authInvitationCode = $state('');
let isLoginMode = $state(true); // true = login, false = register
let submitted = $state(false); // 首次提交后才显示错误

const authValidation = $derived(
  isLoginMode
    ? safeParse(loginSchema, { username: authUsername, password: authPassword })
    : safeParse(registerSchema, {
        username: authUsername,
        password: authPassword,
        code: authInvitationCode || undefined,
      }),
);

function fieldError(field: string): string | null {
  if (!submitted || authValidation.success) return null;
  return authValidation.issues.find((i) => i.path?.[0]?.key === field)?.message ?? null;
}

// Check if first user registration (setup status)
let hasUsers = $state(true);

// Turnstile state
let turnstileContainer = $state<HTMLElement | null>(null);
let turnstileToken = $state('');
let turnstileWidgetId = $state<string | null>(null);

function renderTurnstile() {
  if (
    typeof window !== 'undefined' &&
    (window as any).turnstile &&
    turnstileContainer &&
    appState.turnstileSiteKey
  ) {
    if (turnstileWidgetId !== null) {
      (window as any).turnstile.reset(turnstileWidgetId);
      turnstileToken = '';
    } else {
      turnstileWidgetId = (window as any).turnstile.render(turnstileContainer, {
        sitekey: appState.turnstileSiteKey,
        callback: (token: string) => {
          turnstileToken = token;
        },
        'error-callback': () => {
          console.error('Turnstile widget error');
        },
      });
    }
  }
}

let isScriptLoaded = $state(typeof window !== 'undefined' && !!(window as any).turnstile);

// Render Turnstile when container, sitekey, and script are resolved
$effect(() => {
  const container = turnstileContainer;
  const mode = isLoginMode;
  const siteKey = appState.turnstileSiteKey;
  const loaded = isScriptLoaded;

  if (container && siteKey && loaded) {
    renderTurnstile();
  }
});

onMount(async () => {
  try {
    const result = await unwrap(client.api.auth['setup-status'].$get());
    if (result.code === 'ok') {
      hasUsers = result.data.hasUsers;
      appState.turnstileSiteKey = result.data.turnstileSiteKey;
    }
  } catch (err) {
    console.error('获取注册配置状态失败:', err);
  }
});

function resetTurnstile() {
  if (turnstileWidgetId !== null && (window as any).turnstile) {
    (window as any).turnstile.reset(turnstileWidgetId);
    turnstileToken = '';
  }
}

async function handleAuth() {
  submitted = true;
  if (!authValidation.success) return;

  if (isLoginMode) {
    const res = await appState.login(authUsername, authPassword, turnstileToken);
    if (res.success) {
      authUsername = '';
      authPassword = '';
      submitted = false;
    } else {
      resetTurnstile();
    }
  } else {
    if (hasUsers && !authInvitationCode.trim()) {
      appState.showDialog('提示', '⚠️ 请输入注册邀请码！');
      return;
    }
    const res = await appState.register(
      authUsername,
      authPassword,
      authInvitationCode,
      turnstileToken,
    );
    if (res.success) {
      authUsername = '';
      authPassword = '';
      authInvitationCode = '';
      submitted = false;
      hasUsers = true;
    } else {
      resetTurnstile();
    }
  }
}
</script>

<svelte:head>
  {#if appState.turnstileSiteKey}
    <link rel="preconnect" href="https://challenges.cloudflare.com" />
    <script
      src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
      async
      defer
      onload={() => {
        isScriptLoaded = true;
      }}
    ></script>
  {/if}
</svelte:head>

<!-- ================= AUTH PANEL ================= -->
<BlockTitle>用户注册与登录</BlockTitle>
<Card outline>
  <Block class="space-y-4">
    <Segmented strong rounded>
      <SegmentedButton active={isLoginMode} onclick={() => { isLoginMode = true; submitted = false; }}>
        用户登录
      </SegmentedButton>
      <SegmentedButton active={!isLoginMode} onclick={() => { isLoginMode = false; submitted = false; }}>
        注册账户
      </SegmentedButton>
    </Segmented>

    <List nested>
      <ListInput
        label="用户名"
        type="text"
        placeholder="请输入用户名"
        bind:value={authUsername}
        error={fieldError('username') ?? undefined}
      />
      <ListInput
        label="密码"
        type="password"
        placeholder="请输入密码"
        bind:value={authPassword}
        error={fieldError('password') ?? undefined}
      />
      {#if !isLoginMode && hasUsers}
        <ListInput
          label="邀请码 (必填)"
          type="text"
          placeholder="请输入管理员分配的邀请码"
          bind:value={authInvitationCode}
        />
      {/if}
    </List>

    <!-- First-user admin notice (no invitation code required) -->
    {#if !isLoginMode && !hasUsers}
      <Block strong class="text-indigo-400 text-[11px] text-center rounded-xl">
        💡 系统未检测到活跃账户。作为首位注册者，您将直接被设立为系统管理员，<b>无需邀请码</b>。
      </Block>
    {/if}

    <!-- Turnstile Widget Container -->
    {#if appState.turnstileSiteKey}
      <div class="my-4 flex justify-center">
        <div bind:this={turnstileContainer}></div>
      </div>
    {/if}

    <Button large rounded onclick={handleAuth}>
      {isLoginMode ? '立即登录' : '立即注册'}
    </Button>
  </Block>
</Card>
