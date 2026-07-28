import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { StatusPill } from "@/components/StatusPill";
import { LoadingBlock, EmptyBlock } from "@/components/States";
import { toast } from "sonner";
import { formatApiErrorDetail } from "@/lib/api";
import { timeAgo } from "@/lib/status";
import { Flag, ArrowUp, ArrowDown, Loader2 } from "lucide-react";

export default function Triage() {
  const [unranked, setUnranked] = useState(null);
  const [queue, setQueue] = useState(null);

  const load = useCallback(async () => {
    const [u, q] = await Promise.all([
      api.get("/requests", { params: { scope: "all", status: "submitted" } }),
      api.get("/requests", { params: { scope: "all", status: "prioritized" } }),
    ]);
    setUnranked(u.data);
    setQueue(q.data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="font-heading text-2xl md:text-3xl font-bold tracking-tight">Triage</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Rank incoming submissions into the master queue. Setting a priority locks the brief.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <h2 className="font-heading font-semibold text-lg mb-3">Unranked ({unranked?.length ?? 0})</h2>
          {unranked === null ? (
            <LoadingBlock />
          ) : unranked.length === 0 ? (
            <EmptyBlock title="Nothing to triage" description="Great — you're clear." testid="triage-empty" />
          ) : (
            <ul className="rounded-lg border border-border bg-card divide-y divide-border">
              {unranked.map((r) => (
                <TriageRow key={r.id} req={r} onDone={load} />
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="font-heading font-semibold text-lg mb-3">Master queue ({queue?.length ?? 0})</h2>
          {queue === null ? (
            <LoadingBlock />
          ) : queue.length === 0 ? (
            <EmptyBlock title="Queue is empty" description="Prioritized items appear here." />
          ) : (
            <ul className="rounded-lg border border-border bg-card divide-y divide-border">
              {queue.map((r, idx) => (
                <QueueRow key={r.id} req={r} idx={idx} onDone={load} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function TriageRow({ req, onDone }) {
  const [priority, setPriority] = useState("");
  const [hi, setHi] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/requests/${req.id}/prioritize`, {
        priority: priority === "" ? null : Number(priority),
        high_importance: hi,
      });
      toast.success(`'${req.title}' prioritized`);
      onDone();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="p-3" data-testid={`triage-row-${req.id}`}>
      <Link to={`/requests/${req.id}`} className="block">
        <div className="font-medium truncate">{req.title}</div>
        <div className="text-xs text-muted-foreground truncate mt-0.5">
          {req.channel} · {req.requester?.name} · {timeAgo(req.created_at)}
        </div>
      </Link>
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <label className="text-xs inline-flex items-center gap-1.5">
          <input type="checkbox" checked={hi} onChange={(e) => setHi(e.target.checked)}
                 data-testid={`hi-checkbox-${req.id}`} />
          HI
        </label>
        <input
          type="number" min={1}
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          placeholder="#"
          data-testid={`priority-input-${req.id}`}
          className="w-16 px-2 py-1 rounded border border-border bg-background text-xs"
        />
        <button
          onClick={submit}
          disabled={busy}
          data-testid={`prioritize-btn-${req.id}`}
          className="px-3 py-1 rounded bg-emerald-500 hover:bg-emerald-600 text-emerald-950 text-xs font-medium inline-flex items-center gap-1 disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Flag className="w-3 h-3" />} Rank
        </button>
      </div>
    </li>
  );
}

function QueueRow({ req, idx, onDone }) {
  const move = async (delta) => {
    const newPriority = Math.max(1, (req.priority ?? idx + 1) + delta);
    try {
      await api.post(`/requests/${req.id}/prioritize`, {
        priority: newPriority,
        high_importance: req.high_importance || false,
      });
      onDone();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed");
    }
  };
  return (
    <li className="p-3 flex items-center gap-3">
      <div className="w-6 text-center text-xs font-mono text-muted-foreground">
        {req.high_importance ? "HI" : req.priority ?? "-"}
      </div>
      <Link to={`/requests/${req.id}`} className="flex-1 min-w-0">
        <div className="font-medium truncate">{req.title}</div>
        <div className="text-xs text-muted-foreground truncate">
          {req.channel} · {req.requester?.name}
        </div>
      </Link>
      <StatusPill status={req.status} />
      <div className="flex flex-col gap-1">
        <button
          onClick={() => move(-1)}
          data-testid={`queue-up-${req.id}`}
          className="p-1 rounded hover:bg-muted"
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => move(1)}
          data-testid={`queue-down-${req.id}`}
          className="p-1 rounded hover:bg-muted"
        >
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
      </div>
    </li>
  );
}
