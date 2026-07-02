<script lang="ts">
import { AlertCircle, AlertTriangle, Bell, ExternalLink, HelpCircle, Info } from '@lucide/svelte';
import { Badge, Block, BlockTitle, List, ListInput, ListItem } from 'konsta/svelte';
import { formatDate, getPriorityBadge } from '../utils';
import type { WebPushState } from '../webpush-state.svelte';

interface Props {
  appState: WebPushState;
}

let { appState }: Props = $props();

// Filter states
let searchQuery = $state('');
let selectedTopic = $state('all');
let selectedPriority = $state('all');

// Extract unique topics from history dynamically
let uniqueTopics = $derived.by(() => {
  const topics = new Set<string>();
  for (const msg of appState.historyList) {
    if (msg.topic) {
      topics.add(msg.topic);
    }
  }
  return Array.from(topics).sort();
});

// Reactively filter history
let filteredHistory = $derived.by(() => {
  return appState.historyList.filter((msg: any) => {
    // 1. Text Search (title or body)
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const titleMatch = (msg.title || '').toLowerCase().includes(q);
      const bodyMatch = (msg.body || '').toLowerCase().includes(q);
      const tagsMatch = (msg.tags || '').toLowerCase().includes(q);
      if (!titleMatch && !bodyMatch && !tagsMatch) {
        return false;
      }
    }

    // 2. Topic Filter
    if (selectedTopic !== 'all') {
      if (msg.topic !== selectedTopic) {
        return false;
      }
    }

    // 3. Priority Filter
    if (selectedPriority !== 'all') {
      if (msg.priority !== Number(selectedPriority)) {
        return false;
      }
    }

    return true;
  });
});

function getPriorityIcon(prio: number) {
  switch (prio) {
    case 1:
      return { icon: HelpCircle, color: 'text-slate-400', bg: 'bg-slate-500/10' };
    case 2:
      return { icon: Info, color: 'text-emerald-400', bg: 'bg-emerald-500/10' };
    case 3:
      return { icon: Bell, color: 'text-blue-400', bg: 'bg-blue-500/10' };
    case 4:
      return { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10' };
    case 5:
      return { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10 animate-pulse' };
    default:
      return { icon: Bell, color: 'text-blue-400', bg: 'bg-blue-500/10' };
  }
}
</script>

<BlockTitle>消息历史 (近 50 条)</BlockTitle>

<!-- Filter Console -->
<List strong inset class="mb-4!">
  <ListInput
    type="text"
    placeholder="搜索标题、正文或标签..."
    bind:value={searchQuery}
    clearButton
    onClear={() => (searchQuery = '')}
  />
  <ListInput
    label="订阅主题 (Topic)"
    type="select"
    bind:value={selectedTopic}
  >
    <option value="all">所有主题 ({uniqueTopics.length})</option>
    {#each uniqueTopics as topic}
      <option value={topic}>#{topic}</option>
    {/each}
  </ListInput>
  <ListInput
    label="优先级 (Priority)"
    type="select"
    bind:value={selectedPriority}
  >
    <option value="all">所有优先级</option>
    <option value="1">1 - 最低 (Very Low)</option>
    <option value="2">2 - 低 (Low)</option>
    <option value="3">3 - 普通 (Normal)</option>
    <option value="4">4 - 高 (High)</option>
    <option value="5">5 - 紧急 (Critical)</option>
  </ListInput>
</List>

{#if filteredHistory.length === 0}
  <Block strong outline inset class="text-center">
    没有找到符合筛选条件的历史记录。
  </Block>
{:else}
  <List strong inset>
    {#each filteredHistory as msg}
      {@const badge = getPriorityBadge(msg.priority)}
      {@const prioMeta = getPriorityIcon(msg.priority)}
      {@const IconComponent = prioMeta.icon}

      <ListItem
        title={msg.title || '通知推送'}
        subtitle={msg.body}
        link={!!msg.url}
        onclick={() => msg.url && window.open(msg.url, '_blank', 'noopener,noreferrer')}
        class="group"
      >
        <!-- Icon / Media on the left -->
        {#snippet media()}
          <div class="p-2 rounded-xl {prioMeta.bg} {prioMeta.color} flex items-center justify-center mr-1">
            <IconComponent size="18" />
          </div>
        {/snippet}

        <!-- Header: topic badge + timestamp -->
        {#snippet header()}
          <div class="flex items-center gap-2 mb-1">
            <Badge class="bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-mono text-[9px] px-1">
              #{msg.topic}
            </Badge>
            <span class="text-[9px] text-slate-500 font-mono">{formatDate(msg.created_at)}</span>
          </div>
        {/snippet}

        <!-- Right: priority badge & link indicator -->
        {#snippet after()}
          <div class="flex items-center gap-1.5 ml-2 self-start mt-4">
            <Badge class="{badge.class} text-[9px] px-1.5 py-0.5">
              {badge.label}
            </Badge>
            {#if msg.url}
              <ExternalLink size="12" class="text-indigo-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            {/if}
          </div>
        {/snippet}

        <!-- Footer: tags + link preview -->
        {#snippet footer()}
          {#if msg.tags || msg.url}
            <div class="space-y-1.5 mt-2">
              {#if msg.tags}
                <div class="flex gap-1 flex-wrap">
                  {#each msg.tags.split(',') as tag}
                    <Badge class="bg-slate-800/80 border border-slate-700/30 text-slate-400 text-[8px] px-1.5 rounded-md font-mono">
                      🏷️ {tag.trim()}
                    </Badge>
                  {/each}
                </div>
              {/if}
              {#if msg.url}
                <div class="text-[9px] text-indigo-400/80 font-medium flex items-center gap-0.5 group-hover:text-indigo-400 transition-colors truncate">
                  链接: {msg.url}
                </div>
              {/if}
            </div>
          {/if}
        {/snippet}
      </ListItem>
    {/each}
  </List>
{/if}
