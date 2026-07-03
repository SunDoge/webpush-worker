<script lang="ts">
import { Block, BlockTitle, Button, Card, List, ListItem } from 'konsta/svelte';

interface Props {
  apiToken: string;
  sendTopic: string;
  sendTitle: string;
  sendBody: string;
  sendUrl: string;
  sendTags: string;
  sendPriority: number;
}

let { apiToken, sendTopic, sendTitle, sendBody, sendUrl, sendTags, sendPriority }: Props = $props();

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
  const headerTitle = sendTitle ? ` -H "Title: ${sendTitle}"` : '';
  const headerClick = sendUrl ? ` -H "Click: ${sendUrl}"` : '';
  const headerPriority = sendPriority !== 3 ? ` -H "Priority: ${sendPriority}"` : '';
  const headerTags = sendTags ? ` -H "Tags: ${sendTags}"` : '';
  const tokenPart = apiToken ? ` -H "Authorization: Bearer ${apiToken}"` : '';

  return `curl -X POST${tokenPart}${headerTitle}${headerClick}${headerPriority}${headerTags} \\
  -d "${sendBody || 'Hello from terminal!'}" \\
  ${baseUrl}/api/push/${sendTopic}`;
});
</script>

<BlockTitle>CURL 命令行集成</BlockTitle>
<Card outline>
  <Block class="space-y-3">
    <p class="text-sm text-slate-400">
      您可以在服务端脚本、定时任务或 CI/CD（GitHub Actions）中直接粘贴执行以下实时生成的 <code>curl</code> 推送命令：
    </p>
    <pre class="p-3 bg-slate-900/60 border border-slate-800 rounded-lg overflow-x-auto text-xs font-mono text-emerald-400 whitespace-pre-wrap break-all max-h-56 select-all">{curlCommand}</pre>
    <Button small rounded outline onclick={() => copyText(curlCommand)}>
      {isCopied ? '已复制！' : '复制命令'}
    </Button>
  </Block>
</Card>

<!-- Request parameters specification -->
<BlockTitle>ntfy 样式请求头参数</BlockTitle>
<List strong inset>
  <ListItem title="Title" subtitle="通知的大标题" />
  <ListItem title="Priority" subtitle="优先级 1-5 (1:最低, 3:默认, 5:紧急)" />
  <ListItem title="Click" subtitle="点击通知所要打开的网页 URL" />
  <ListItem title="Tags" subtitle="标签，支持 Emoji (以英文逗号分割)" />
</List>
