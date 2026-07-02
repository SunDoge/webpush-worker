<script lang="ts">
import {
  Badge,
  Block,
  BlockFooter,
  BlockTitle,
  Button,
  Card,
  Checkbox,
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

// Local form state for new topic
let newTopicName = $state('');

async function handleCreateTopic() {
  const cleanName = newTopicName.trim();
  if (!cleanName) {
    appState.showDialog('提示', '⚠️ 主题名称不能为空！');
    return;
  }
  // 仅允许字母、数字、下划线、中划线
  if (!/^[a-zA-Z0-9_-]+$/.test(cleanName)) {
    appState.showDialog('提示', '⚠️ 主题名称仅允许包含字母、数字、下划线和中划线！');
    return;
  }
  const success = await appState.createTopic(cleanName);
  if (success) {
    newTopicName = '';
    // 自动勾选并订阅该新创建的主题
    if (!appState.selectedTopics.includes(cleanName)) {
      appState.selectedTopics = [...appState.selectedTopics, cleanName];
      // 如果设备已经在云端注册，自动同步到服务器
      if (appState.isRegisteredOnServer) {
        await appState.subscribeDevice();
      }
    }
  }
}
</script>

<!-- ================= 1. LOCAL DEVICE STATUS ================= -->
<BlockTitle>本机推送控制台</BlockTitle>
<Card outline>
  <Block class="space-y-4">
    <!-- Pulsing Status Dot + Description -->
    <div class="flex items-center gap-3">
      <div class="relative flex h-3 w-3 shrink-0">
        {#if appState.isRegisteredOnServer}
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
        {:else if appState.subscriptionJson}
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
        {:else}
          <span class="relative inline-flex rounded-full h-3 w-3 bg-slate-500"></span>
        {/if}
      </div>
      <div>
        {#if appState.isRegisteredOnServer}
          <p class="text-emerald-500 font-semibold text-sm">推送已就绪</p>
          <p class="text-xs text-slate-400 mt-0.5">此浏览器已注册并可成功接收通知。</p>
        {:else if appState.subscriptionJson}
          <p class="text-amber-500 font-semibold text-sm">已配对，未同步云端</p>
          <p class="text-xs text-slate-400 mt-0.5">本地已生成凭证，请点击下方按钮绑定到服务器。</p>
        {:else}
          <p class="text-slate-400 font-semibold text-sm">未启用推送服务</p>
          <p class="text-xs text-slate-400 mt-0.5">此浏览器尚未在云端注册通知授权。</p>
        {/if}
      </div>
    </div>

    <!-- Metadata -->
    <List nested class="my-0!">
      <ListItem title="通知授权状态 (Permission)" after={appState.permission.toUpperCase()} />
      <ListItem title="运行设备" after={appState.deviceName} />
      <ListItem title="已订阅主题" after={appState.selectedTopics.length > 0 ? appState.selectedTopics.join(', ') : '无'} />
    </List>

    <!-- Action Button -->
    {#if appState.isRegisteredOnServer}
      <Button large rounded outline onclick={() => appState.unsubscribeDevice()} colors={{ textIos: 'text-red-500', textMaterial: 'text-red-500', outlineBorderIos: 'border-red-500', outlineBorderMaterial: 'border-red-500' }}>
        注销此设备
      </Button>
    {:else}
      <Button large rounded onclick={() => appState.subscribeDevice()}>
        注册并允许推送
      </Button>
    {/if}
  </Block>
</Card>

<!-- ================= 2. TOPICS SUBSCRIPTION & MANAGEMENT ================= -->
<BlockTitle>主题订阅与管理 (Topics)</BlockTitle>
<Card outline>
  {#if appState.userTopics.length > 0}
    <List nested class="my-0!">
      {#each appState.userTopics as topic}
        <ListItem title={topic.name}>
          {#snippet media()}
            <Checkbox
              checked={appState.selectedTopics.includes(topic.name)}
              onchange={async (e) => {
                const input = e.currentTarget as unknown as HTMLInputElement;
                if (input.checked) {
                  if (!appState.selectedTopics.includes(topic.name)) {
                    appState.selectedTopics = [...appState.selectedTopics, topic.name];
                  }
                } else {
                  appState.selectedTopics = appState.selectedTopics.filter(t => t !== topic.name);
                }
                // 如果设备已经在云端注册，自动同步到服务器
                if (appState.isRegisteredOnServer) {
                  await appState.subscribeDevice();
                }
              }}
            />
          {/snippet}
          {#snippet after()}
            <div class="flex items-center gap-2">
              {#if topic.name === 'default'}
                <Badge colors={{ bg: 'bg-indigo-500/10 text-indigo-400' }} class="text-2xs border border-indigo-500/20">
                  默认
                </Badge>
              {:else}
                <Button
                  small inline rounded outline
                  onclick={() => appState.deleteTopic(topic.name)}
                  colors={{ textIos: 'text-red-500', textMaterial: 'text-red-500', outlineBorderIos: 'border-red-500', outlineBorderMaterial: 'border-red-500' }}
                  class="h-6 px-2 text-xs"
                >
                  删除
                </Button>
              {/if}
            </div>
          {/snippet}
        </ListItem>
      {/each}
    </List>
  {:else}
    <Block strong outline inset class="text-center my-0!">
      暂无推送主题
    </Block>
  {/if}

  <hr class="border-slate-100 dark:border-slate-800 my-0" />

  <!-- Quick Add Topic Form inside Card -->
  <Block class="my-0! py-4! bg-slate-50/50 dark:bg-slate-900/10">
    <div class="flex items-end gap-3">
      <div class="flex-1">
        <label for="new-topic-input" class="block text-xs font-semibold text-slate-400 mb-1">新建推送主题</label>
        <input
          id="new-topic-input"
          type="text"
          placeholder="输入新主题名，如 home-assistant"
          class="w-full h-10 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
          bind:value={newTopicName}
          onkeydown={(e) => {
            if (e.key === 'Enter') {
              handleCreateTopic();
            }
          }}
        />
      </div>
      <Button rounded class="h-10 px-4 w-auto shrink-0" onclick={handleCreateTopic}>
        添加主题
      </Button>
    </div>
    <p class="text-2xs text-slate-400 mt-2">
      主题仅允许字母、数字、下划线和中划线。创建后，外部可通过 <code>/api/send/[主题名]</code> 发送通知。
    </p>
  </Block>
</Card>

<!-- ================= 3. PAIRED DEVICES LIST ================= -->
<BlockTitle>云端已配对设备 ({appState.devicesList.length})</BlockTitle>
{#if appState.devicesList.length === 0}
  <Block strong outline inset class="text-center">
    暂无云端注册设备，配置管理密钥后将自动拉取
  </Block>
{:else}
  <List strong inset>
    {#each appState.devicesList as dev}
      {@const isSelf = dev.endpoint === appState.localEndpoint}
      <ListItem
        title={dev.name}
        after={isSelf ? '本机' : ''}
        subtitle={`订阅 Topic: ${dev.topics}`}
        text={`注册时间: ${formatDate(dev.created_at)}`}
      />
    {/each}
  </List>
{/if}
