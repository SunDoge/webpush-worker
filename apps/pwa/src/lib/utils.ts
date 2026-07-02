export function getPriorityBadge(prio: number) {
  switch (prio) {
    case 1:
      return { label: 'Min', class: 'bg-slate-600 text-white' };
    case 2:
      return { label: 'Low', class: 'bg-emerald-600 text-white' };
    case 3:
      return { label: 'Default', class: 'bg-blue-600 text-white' };
    case 4:
      return { label: 'High', class: 'bg-amber-600 text-white' };
    case 5:
      return { label: 'Urgent', class: 'bg-red-600 text-white animate-pulse' };
    default:
      return { label: 'Default', class: 'bg-blue-600 text-white' };
  }
}

export function formatDate(unixSecs: number) {
  const d = new Date(unixSecs * 1000);
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
