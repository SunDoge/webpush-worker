<script lang="ts">
import {
  Badge,
  Block,
  BlockTitle,
  Button,
  Card,
  List,
  ListInput,
  ListItem,
  Range,
} from 'konsta/svelte';
import { getPriorityBadge } from '../utils';
import type { WebPushState } from '../webpush-state.svelte';

interface Props {
  appState: WebPushState;
}

let { appState }: Props = $props();

// Copy helper
let isCopied = $state(false);
function copyText(text: string) {
  navigator.clipboard.writeText(text);
  isCopied = true;
  setTimeout(() => {
    isCopied = false;
  }, 2000);
}

// Reactive Derived Values for real-time curl preview
let curlCommand = $derived.by(() => {
  const baseUrl = window.location.origin;
  const tokenPart = appState.apiToken ? ` -H "Authorization: Bearer ${appState.apiToken}"` : '';
  const topic = appState.sendTopic || 'default';

  const payload = {
    title: appState.sendTitle || undefined,
    body: appState.sendBody || 'Hello from terminal!',
    url: appState.sendUrl || undefined,
    priority: appState.sendPriority !== 3 ? appState.sendPriority : undefined,
    tags: appState.sendTags || undefined,
  };

  const jsonStr = JSON.stringify(payload, null, 2);

  return `curl -X POST -H "Content-Type: application/json"${tokenPart} \\
  -d '${jsonStr.replace(/'/g, "'\\''")}' \\
  ${baseUrl}/api/push/${topic}`;
});
</script>

<BlockTitle>发送推送测试消息</BlockTitle>
<List strong inset>
  <ListInput
    label="目标主题 (Topic)"
    type="select"
    dropdown
    bind:value={appState.sendTopic}
    disabled={appState.userTopics.length === 0}
  >
    {#if appState.userTopics.length === 0}
      <option value="default">default</option>
    {:else}
      {#each appState.userTopics as topic}
        <option value={topic.name}>{topic.name}</option>
      {/each}
    {/if}
  </ListInput>
  <ListInput
    label="推送标题 (Title)"
    type="text"
    placeholder="通知框的大标题 (可选)"
    bind:value={appState.sendTitle}
  />
  <ListInput
    label="推送正文 (Message) *"
    type="textarea"
    placeholder="请输入想要发送的推送正文..."
    bind:value={appState.sendBody}
    inputClass="h-24"
  />
  <ListInput
    label="点击跳转链接 (Click URL)"
    type="url"
    placeholder="https://example.com (可选)"
    bind:value={appState.sendUrl}
  />
  <ListInput
    label="标签/Emoji (Tags)"
    type="text"
    placeholder="warning, server_up (逗号分隔)"
    bind:value={appState.sendTags}
  />

  <!-- Priority slider -->
  <ListItem title="优先级 (Priority)">
    {#snippet after()}
      <div class="flex items-center gap-2">
        <Badge class={getPriorityBadge(appState.sendPriority).class}>
          {getPriorityBadge(appState.sendPriority).label}
        </Badge>
        <Range
          bind:value={appState.sendPriority}
          min={1}
          max={5}
          step={1}
          class="w-24"
        />
      </div>
    {/snippet}
  </ListItem>
</List>

<Block>
  <Button large rounded onclick={() => appState.triggerPush()} disabled={appState.isSending || !appState.sendBody}>
    {appState.isSending ? '发送中...' : '立即发送'}
  </Button>
</Block>

<!-- Status Result -->
{#if appState.sendStatus.message}
  <Block strong inset class={`text-sm ${appState.sendStatus.success ? 'text-emerald-500' : 'text-red-500'}`}>
    {appState.sendStatus.message}
  </Block>
{/if}

<!-- ================= CURL INTEGRATION PREVIEW ================= -->
<BlockTitle>CURL 命令行集成</BlockTitle>
<Card outline>
  <Block class="space-y-3">
    <p class="text-sm text-slate-400">
      您可以在服务端脚本、定时任务或 CI/CD 中直接粘贴执行以下实时生成的 <code>curl</code> 推送命令：
    </p>
    <pre class="p-3 bg-slate-900/60 border border-slate-800 rounded-lg overflow-x-auto text-xs font-mono text-emerald-400 whitespace-pre-wrap break-all max-h-56 select-all">{curlCommand}</pre>
    <Button small rounded outline onclick={() => copyText(curlCommand)}>
      {isCopied ? '已复制！' : '复制命令'}
    </Button>
  </Block>
</Card>
