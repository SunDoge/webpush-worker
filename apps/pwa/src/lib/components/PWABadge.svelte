<script lang="ts">
import { useRegisterSW } from 'virtual:pwa-register/svelte';

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

{#if toast}
  <div
    class="pwa-toast fixed bottom-20 right-4 md:right-6 md:bottom-6 z-50 max-w-sm w-[calc(100vw-2rem)] bg-slate-900/95 backdrop-blur-xl border border-indigo-500/30 rounded-2xl shadow-2xl p-4 flex flex-col gap-3 animate-slide-in text-slate-100"
    role="alert"
    aria-labelledby="toast-message"
  >
    <div class="flex items-start gap-3">
      <div class="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl mt-0.5">
        {#if $offlineReady}
          <!-- Checkmark Icon for offline ready -->
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        {:else}
          <!-- Refresh Icon for updates -->
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.2" />
          </svg>
        {/if}
      </div>
      <div class="flex-1">
        <h4 class="text-sm font-semibold text-white">
          {#if $offlineReady}离线使用已就绪{:else}更新已就绪{/if}
        </h4>
        <p id="toast-message" class="text-xs text-slate-400 mt-1 leading-relaxed">
          {#if $offlineReady}
            应用已成功缓存，现在可以离线访问了！
          {:else}
            发现新版本应用，请点击刷新按钮以升级到最新版。
          {/if}
        </p>
      </div>
    </div>
    <div class="flex justify-end gap-2 border-t border-slate-800/80 pt-3">
      <button 
        type="button" 
        onclick={close}
        class="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition"
      >
        关闭
      </button>
      {#if $needRefresh}
        <button 
          type="button" 
          onclick={() => updateServiceWorker(true)}
          class="px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all rounded-lg shadow-md shadow-indigo-600/10"
        >
          立即刷新
        </button>
      {/if}
    </div>
  </div>
{/if}

<style>
  @keyframes slideIn {
    from {
      transform: translateY(1.5rem);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .pwa-toast {
    animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
</style>
