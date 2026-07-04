<script lang="ts">
import { useRegisterSW } from 'virtual:pwa-register/svelte';
import { CircleCheck, RefreshCw } from '@lucide/svelte';
import { Button, Toast } from 'konsta/svelte';

// 每小时检查一次更新 (60 * 60 * 1000 毫秒)
const period = 60 * 60 * 1000;

function registerPeriodicSync(swUrl: string, r: ServiceWorkerRegistration) {
  if (period <= 0) return;

  setInterval(async () => {
    if ('onLine' in navigator && !navigator.onLine) return;

    const resp = await fetch(swUrl, {
      cache: 'no-store',
      headers: {
        cache: 'no-store',
        'cache-control': 'no-cache',
      },
    });

    if (resp?.status === 200) await r.update();
  }, period);
}

const { offlineReady, needRefresh, updateServiceWorker } = useRegisterSW({
  onRegisteredSW(swUrl, r) {
    if (period <= 0) return;
    if (r?.active?.state === 'activated') {
      registerPeriodicSync(swUrl, r);
    } else if (r?.installing) {
      r.installing.addEventListener('statechange', (e) => {
        const sw = e.target as ServiceWorker;
        if (sw.state === 'activated') registerPeriodicSync(swUrl, r);
      });
    }
  },
});

function close() {
  offlineReady.set(false);
  needRefresh.set(false);
}

let toast = $derived($offlineReady || $needRefresh);
</script>

<Toast
  position="center"
  opened={toast}
>
  <div class="flex items-center gap-3">
    <!-- Status Icon -->
    {#if $offlineReady}
      <CircleCheck class="h-5 w-5 text-emerald-500 shrink-0" />
    {:else}
      <RefreshCw class="h-5 w-5 text-indigo-500 shrink-0" />
    {/if}

    <!-- Content Text -->
    <div class="text-sm font-medium">
      {#if $offlineReady}
        离线缓存就绪，现在可离线访问应用。
      {:else}
        新版本已就绪，请点击刷新按钮以升级。
      {/if}
    </div>
  </div>

  {#snippet button()}
    <div class="flex items-center gap-1.5">
      <Button small inline clear onclick={close} class="text-slate-400 dark:text-slate-300">
        关闭
      </Button>
      {#if $needRefresh}
        <Button small inline rounded onclick={() => updateServiceWorker(true)} class="shadow-sm">
          立即刷新
        </Button>
      {/if}
    </div>
  {/snippet}
</Toast>
