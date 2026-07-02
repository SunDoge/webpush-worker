<script lang="ts">
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
import type { WebPushState } from '../webpush-state.svelte';
import { client } from '../webpush-state.svelte';

interface Props {
  appState: WebPushState;
}

let { appState }: Props = $props();

// Auth form state
let authUsername = $state('');
let authPassword = $state('');
let authInvitationCode = $state('');
let isLoginMode = $state(true); // true = login, false = register

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

// Render Turnstile when container and sitekey are resolved
$effect(() => {
  const container = turnstileContainer;
  const mode = isLoginMode;
  const siteKey = appState.turnstileSiteKey;

  if (container && siteKey) {
    const checkInterval = setInterval(() => {
      if ((window as any).turnstile) {
        clearInterval(checkInterval);
        renderTurnstile();
      }
    }, 100);

    return () => {
      clearInterval(checkInterval);
    };
  }
});

onMount(async () => {
  try {
    const res = await client.api.auth['setup-status'].$get();
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        hasUsers = data.data.hasUsers;
        appState.turnstileSiteKey = data.data.turnstileSiteKey;
      }
    }
  } catch (err) {
    console.error('获取注册配置状态失败:', err);
  }
});

async function handleAuth() {
  if (!authUsername || !authPassword) {
    appState.showDialog('提示', '⚠️ 请输入用户名和密码！');
    return;
  }
  if (isLoginMode) {
    const res = await appState.login(authUsername, authPassword, turnstileToken);
    if (res.success) {
      authUsername = '';
      authPassword = '';
    } else {
      if (turnstileWidgetId !== null && (window as any).turnstile) {
        (window as any).turnstile.reset(turnstileWidgetId);
        turnstileToken = '';
      }
    }
  } else {
    // 注册时，若已存在其他用户才需要邀请码验证，首位注册直接允许空邀请码
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
      // 登录成功后重新查询状态
      hasUsers = true;
    } else {
      if (turnstileWidgetId !== null && (window as any).turnstile) {
        (window as any).turnstile.reset(turnstileWidgetId);
        turnstileToken = '';
      }
    }
  }
}
</script>

<!-- ================= AUTH PANEL ================= -->
<BlockTitle>用户注册与登录</BlockTitle>
<Card outline>
  <Block class="space-y-4">
    <Segmented strong rounded>
      <SegmentedButton active={isLoginMode} onclick={() => isLoginMode = true}>
        用户登录
      </SegmentedButton>
      <SegmentedButton active={!isLoginMode} onclick={() => isLoginMode = false}>
        注册账户
      </SegmentedButton>
    </Segmented>

    <List nested>
      <ListInput
        label="用户名"
        type="text"
        placeholder="请输入用户名 (至少 3 位)"
        bind:value={authUsername}
      />
      <ListInput
        label="密码"
        type="password"
        placeholder="请输入密码 (至少 6 位)"
        bind:value={authPassword}
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
