<script lang="ts">
import { History, RefreshCw, Send, Settings, Smartphone } from '@lucide/svelte';
import {
  App,
  Button,
  Dialog,
  DialogButton,
  Navbar,
  Notification,
  Page,
  Tabbar,
  TabbarLink,
  ToolbarPane,
} from 'konsta/svelte';
import { onMount } from 'svelte';
// Import split components
import AuthTab from './lib/components/AuthTab.svelte';
import DeviceTab from './lib/components/DeviceTab.svelte';
import HistoryTab from './lib/components/HistoryTab.svelte';
import PWABadge from './lib/components/PWABadge.svelte';
import SendTab from './lib/components/SendTab.svelte';
import SettingsTab from './lib/components/SettingsTab.svelte';
// Import state controller
import { WebPushState } from './lib/webpush-state.svelte';

const appState = new WebPushState();

onMount(() => {
  appState.init();
});
</script>

<App theme={appState.theme} safeAreas>
  <Page class="pb-safe-24">

    <!-- Global Drop-down Notification Banner (iOS-like Push Card) -->
    <Notification
      opened={appState.toastOpened}
      title="WebPush Console"
      titleRightText="现在"
      subtitle={appState.toastMessage}
      onClose={() => appState.toastOpened = false}
      class="fixed top-4 left-1/2 -translate-x-1/2 w-[92%] max-w-md z-50 shadow-2xl rounded-xl border border-slate-800/40"
    >
      {#snippet icon()}
        <div class="w-5 h-5 flex items-center justify-center bg-indigo-600 text-white rounded text-2xs font-bold">
          WP
        </div>
      {/snippet}
    </Notification>

    <!-- Global Dialog Modal / Confirm -->
    <Dialog opened={appState.dialogOpened} onBackdropClick={() => appState.dialogOpened = false} class="z-50">
      {#snippet title()}{appState.dialogTitle}{/snippet}
      <div class="text-sm whitespace-pre-wrap">{appState.dialogMessage}</div>
      {#snippet buttons()}
        {#if appState.dialogConfirmCallback}
          <DialogButton onclick={() => { appState.dialogOpened = false; appState.dialogConfirmCallback?.(); }} strong>
            确认
          </DialogButton>
          <DialogButton onclick={() => appState.dialogOpened = false} class="text-slate-400">
            取消
          </DialogButton>
        {:else}
          <DialogButton onclick={() => appState.dialogOpened = false} strong>
            知道了
          </DialogButton>
        {/if}
      {/snippet}
    </Dialog>

    <!-- Top Navigation Navbar -->
    <Navbar
      title="WebPush Console"
      subtitle={appState.user ? "自建轻量级 Web 推送服务" : "请先登录或注册您的账户"}
    >
      {#snippet right()}
        {#if appState.user}
          <Button clear onclick={() => appState.refreshData()}>
            <RefreshCw class="w-5 h-5" />
          </Button>
        {/if}
      {/snippet}
    </Navbar>

    {#if !appState.user}
      <!-- 未登录状态：只展示登录注册面板，不显示导航栏与功能卡片 -->
      <div class="max-w-md mx-auto mt-6">
        <AuthTab {appState} />
      </div>
    {:else}
      <!-- 已登录状态：正常显示各 Tab 与底部导航 -->
      {#if appState.currentTab === 'subscribe'}
        <DeviceTab {appState} />
      {/if}

      {#if appState.currentTab === 'history'}
        <HistoryTab {appState} />
      {/if}

      {#if appState.currentTab === 'send'}
        <SendTab {appState} />
      {/if}

      {#if appState.currentTab === 'settings'}
        <SettingsTab {appState} />
      {/if}

      <!-- ================= NATIVE TABBAR (Bottom Navigation) ================= -->
      <Tabbar labels={true} icons={true} class="left-0 bottom-0 fixed">
        <ToolbarPane>
          <!-- 1. TAB: SUBSCRIBE -->
          <TabbarLink
            active={appState.currentTab === 'subscribe'}
            label="设备"
            onclick={() => appState.currentTab = 'subscribe'}
          >
            {#snippet icon()}
              <Smartphone class="w-5 h-5" />
            {/snippet}
          </TabbarLink>

          <!-- 2. TAB: SEND -->
          <TabbarLink
            active={appState.currentTab === 'send'}
            label="推送"
            onclick={() => appState.currentTab = 'send'}
          >
            {#snippet icon()}
              <Send class="w-5 h-5" />
            {/snippet}
          </TabbarLink>

          <!-- 3. TAB: HISTORY -->
          <TabbarLink
            active={appState.currentTab === 'history'}
            label="历史"
            onclick={() => appState.currentTab = 'history'}
          >
            {#snippet icon()}
              <History class="w-5 h-5" />
            {/snippet}
          </TabbarLink>

          <!-- 4. TAB: SETTINGS -->
          <TabbarLink
            active={appState.currentTab === 'settings'}
            label="设置"
            onclick={() => appState.currentTab = 'settings'}
          >
            {#snippet icon()}
              <Settings class="w-5 h-5" />
            {/snippet}
          </TabbarLink>
        </ToolbarPane>
      </Tabbar>
    {/if}
  </Page>
</App>

<PWABadge />
