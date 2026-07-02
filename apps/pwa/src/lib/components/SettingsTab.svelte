<script lang="ts">
import {
  Badge,
  Block,
  BlockFooter,
  BlockTitle,
  Button,
  Card,
  List,
  ListInput,
  ListItem,
} from 'konsta/svelte';
import { formatDate } from '../utils';
import type { WebPushState } from '../webpush-state.svelte';

interface Props {
  appState: WebPushState;
}

let { appState }: Props = $props();

// Settings local state
let newTokenName = $state('');
let generatedToken = $state('');
let isCopied = $state(false);
let copiedInvitationCode = $state('');

async function handleCreateToken() {
  if (!newTokenName.trim()) {
    appState.showDialog('提示', '⚠️ 请输入 Token 标识名称！例如 HomeAssistant');
    return;
  }
  const res = await appState.generateApiToken(newTokenName);
  if (res.success && res.token) {
    generatedToken = res.token;
  }
}

function copyToken() {
  navigator.clipboard.writeText(generatedToken);
  isCopied = true;
  setTimeout(() => {
    isCopied = false;
  }, 2000);
}

function copyInvitationCode(code: string) {
  navigator.clipboard.writeText(code);
  copiedInvitationCode = code;
  setTimeout(() => {
    if (copiedInvitationCode === code) {
      copiedInvitationCode = '';
    }
  }, 2000);
}
</script>

<!-- ================= 1. USER CENTER ================= -->
<BlockTitle>用户中心</BlockTitle>
<List strong inset>
  <ListItem
    title={`当前已登录: ${appState.user?.username}`}
    after={appState.user?.role === 'admin' ? '管理员' : '普通用户'}
  />
</List>
<Block>
  <Button rounded outline onclick={() => appState.logout()} colors={{ textIos: 'text-red-500', textMaterial: 'text-red-500', outlineBorderIos: 'border-red-500', outlineBorderMaterial: 'border-red-500' }}>
    退出当前登录
  </Button>
</Block>

<!-- ================= 1.5. API TOKEN MANAGEMENT ================= -->
<BlockTitle>API Token 管理</BlockTitle>
<Block>
  <p class="text-sm text-slate-400">用于外部终端 CURL、集成脚本或 Webhook 中替代密码进行接口鉴权，短小且可随时撤销。</p>
</Block>

{#if appState.apiTokensList.length > 0}
  <List strong inset>
    {#each appState.apiTokensList as tok}
      <ListItem
        title={tok.name}
        subtitle={`创建于: ${formatDate(tok.created_at)}`}
      >
        {#snippet after()}
          <Button
            clear small
            onclick={() => appState.revokeApiToken(tok.id)}
            colors={{ textIos: 'text-red-400', textMaterial: 'text-red-400' }}
          >
            撤销
          </Button>
        {/snippet}
      </ListItem>
    {/each}
  </List>
{:else}
  <Block strong outline inset class="text-center">暂无活动的 API Token</Block>
{/if}

{#if generatedToken}
  <!-- New token one-time display -->
  <Card outline>
    <Block class="space-y-2">
      <p class="text-xs font-bold text-indigo-400">⚠️ 请复制您的新 API Token（仅显示一次，离开此页将无法查看）：</p>
      <pre class="p-2.5 bg-slate-950 border border-slate-800 rounded-lg overflow-x-auto text-2xs font-mono text-emerald-400 whitespace-pre-wrap break-all max-h-36 select-all">{generatedToken}</pre>
      <div class="flex gap-2">
        <Button small inline rounded outline onclick={copyToken}>
          {isCopied ? '已复制！' : '复制 Token'}
        </Button>
        <Button small inline rounded outline onclick={() => { generatedToken = ''; newTokenName = ''; }} colors={{ textIos: 'text-slate-400', textMaterial: 'text-slate-400', outlineBorderIos: 'border-slate-800', outlineBorderMaterial: 'border-slate-800' }}>
          完成
        </Button>
      </div>
    </Block>
  </Card>
{:else}
  <List strong inset>
    <ListInput
      label="新 Token 标识名称"
      type="text"
      placeholder="输入新 Token 标识，如 HomeAssistant"
      bind:value={newTokenName}
      clearButton={newTokenName.length > 0}
      onClear={() => newTokenName = ''}
    />
  </List>
  <Block>
    <Button rounded outline onclick={handleCreateToken}>新增 Token</Button>
  </Block>
{/if}

<!-- ================= 2. INVITATION CODE CONSOLE (ADMIN ONLY) ================= -->
{#if appState.user?.role === 'admin'}
  <BlockTitle>邀请码管理 (管理员)</BlockTitle>
  <Block class="space-y-3">
    <p class="text-sm text-slate-400">生成一次性邀请码，分发给朋友注册，支持撤销。</p>
    <Button rounded outline onclick={() => appState.generateInvitationCode()}>
      生成新注册邀请码
    </Button>
  </Block>

  {#if appState.invitationCodesList.length > 0}
    <List strong inset>
      {#each appState.invitationCodesList as inv}
        <ListItem
          title={`🔑 ${inv.code}`}
          subtitle={inv.status === 'used'
            ? `使用者: ${inv.recipient_username || '未知'} • ${formatDate(inv.used_at || 0)}`
            : `创建于: ${formatDate(inv.created_at)}`}
          onclick={() => copyInvitationCode(inv.code)}
          class="cursor-pointer font-mono"
        >
          {#snippet after()}
            <div class="flex items-center gap-2">
              {#if copiedInvitationCode === inv.code}
                <span class="text-[9px] text-emerald-400">已复制!</span>
              {/if}
              {#if inv.status === 'pending'}
                <Badge colors={{ bg: 'bg-emerald-500/10 text-emerald-400' }} class="text-[9px] border border-emerald-500/20">
                  未使用
                </Badge>
                <Button
                  clear small
                  onclick={(e) => { e.stopPropagation(); appState.revokeInvitationCode(inv.code); }}
                  colors={{ textIos: 'text-red-400', textMaterial: 'text-red-400' }}
                >
                  删除
                </Button>
              {:else}
                <Badge colors={{ bg: 'bg-slate-800 text-slate-400' }} class="text-[9px] border border-slate-700/30">
                  已使用
                </Badge>
              {/if}
            </div>
          {/snippet}
        </ListItem>
      {/each}
    </List>
  {:else}
    <Block strong outline inset class="text-center">暂无邀请码记录</Block>
  {/if}
{/if}

<!-- ================= 3. CONFIGURATION SETTINGS ================= -->
<BlockTitle>连接设置</BlockTitle>
<List strong inset>
  <ListInput
    label="推送鉴权 Token (CURL 命令使用)"
    type="password"
    placeholder="填入 wpt_ 开头的长期 Token"
    bind:value={appState.apiToken}
  />
  <ListInput
    label="设备名称"
    type="text"
    placeholder="如 iPhone 15, Chrome-PC"
    bind:value={appState.deviceName}
  />
  <ListInput
    label="订阅 Topics (逗号分隔)"
    type="text"
    placeholder="default, alert, server"
    bind:value={appState.topics}
  />
</List>

<BlockTitle>偏好设置</BlockTitle>
<List strong inset>
  <ListInput
    label="UI 主题风格"
    type="select"
    bind:value={appState.themeMode}
  >
    <option value="auto">自动检测 (系统默认)</option>
    <option value="ios">iOS 风格</option>
    <option value="material">Material (Android) 风格</option>
  </ListInput>
</List>

<BlockFooter class="text-center">
  WebPush Console PWA {__APP_VERSION__}<br />
  配置将保存在您的本地浏览器中 (LocalStorage)。
</BlockFooter>
