export const STATUS_META = {
  submitted: { label: "Submitted", tone: "slate" },
  prioritized: { label: "In Queue", tone: "sky" },
  in_content: { label: "In Content", tone: "amber" },
  copy_awaiting_approval: { label: "Copy Review", tone: "violet" },
  in_design: { label: "In Design", tone: "emerald" },
  on_hold: { label: "On Hold", tone: "orange" },
  delivered: { label: "Delivered", tone: "cyan" },
  completed: { label: "Completed", tone: "green" },
  cancelled: { label: "Cancelled", tone: "rose" },
  pending_cancellation: { label: "Pending Cancel", tone: "rose" },
};

const TONES = {
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-200",
  sky: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  violet: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
  emerald: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  orange: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
  cyan: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200",
  green: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
  rose: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
};

export function statusClasses(status) {
  const m = STATUS_META[status] || STATUS_META.submitted;
  return TONES[m.tone] || TONES.slate;
}

export function statusLabel(status) {
  return (STATUS_META[status] || { label: status }).label;
}

export const ROLE_LABELS = {
  requester: "Requester",
  triage: "Triage Lead",
  writer: "Content Writer",
  designer: "Designer",
  executive: "Executive",
};

export function formatDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (e) {
    return iso;
  }
}

export function timeAgo(iso) {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}
