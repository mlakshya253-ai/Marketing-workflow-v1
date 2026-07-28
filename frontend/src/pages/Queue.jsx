import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { StatusPill } from "@/components/StatusPill";
import { LoadingBlock, EmptyBlock } from "@/components/States";
import { toast } from "sonner";
import { formatApiErrorDetail } from "@/lib/api";
import { timeAgo } from "@/lib/status";
import { Hand } from "lucide-react";

export default function Queue() {
  const { user } = useAuth();
  const [available, setAvailable] = useState(null);
  const [mine, setMine] = useState(null);
  const [tab, setTab] = useState("available");

  const load = useCallback(async () => {
    if (user.role === "writer") {
      const [av, mn] = await Promise.all([
        api.get("/requests", { params: { scope: "all", status: "prioritized" } }),
        api.get("/requests", { params: { scope: "awaiting_me" } }),
      ]);
      // Filter writer-eligible: content_source === write_for_me and no writer assigned
      setAvailable(av.data.filter((r) => r.content_source === "write_for_me" && !r.assigned_writer_id));
      setMine(mn.data);
    } else if (user.role === "designer") {
      const [avP, avD, mn] = await Promise.all([
        api.get("/requests", { params: { scope: "all", status: "prioritized" } }),
        api.get("/requests", { params: { scope: "all", status: "in_design" } }),
        api.get("/requests", { params: { scope: "awaiting_me" } }),
      ]);
      const eligible = [
        ...avP.data.filter((r) => r.content_source === "self_provided" && !r.assigned_designer_id),
        ...avD.data.filter((r) => !r.assigned_designer_id),
      ];
      setAvailable(eligible);
      setMine(mn.data);
    } else if (user.role === "triage") {
      const [av, mn] = await Promise.all([
        api.get("/requests", { params: { scope: "all", status: "prioritized" } }),
        api.get("/requests", { params: { scope: "active" } }),
      ]);
      setAvailable(av.data);
      setMine(mn.data);
    } else {
      setAvailable([]);
      setMine([]);
    }
  }, [user.role]);

  useEffect(() => {
    load();
  }, [load]);

  const pickup = async (r) => {
    try {
      await api.post(`/requests/${r.id}/pickup`);
      toast.success(`Picked up: ${r.title}`);
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed");
    }
  };

  const list = tab === "available" ? available : mine;
  const canPickup = user.role === "writer" || user.role === "designer";

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="font-heading text-2xl md:text-3xl font-bold tracking-tight">Queue</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {user.role === "writer" && "Copy tasks waiting for a writer."}
          {user.role === "designer" && "Design tasks waiting for a designer."}
          {user.role === "triage" && "The master queue (all prioritized)."}
        </p>
      </div>

      <div className="flex gap-1 border-b border-border mb-4">
        {[
          { key: "available", label: "Available" },
          { key: "mine", label: "My active work" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            data-testid={`queue-tab-${t.key}`}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {list === null ? (
        <LoadingBlock />
      ) : list.length === 0 ? (
        <EmptyBlock title={tab === "available" ? "Nothing available" : "You're free"}
          description={tab === "available" ? "Check back later." : "No active work assigned."}
          testid="queue-empty" />
      ) : (
        <ul className="rounded-lg border border-border bg-card divide-y divide-border">
          {list.map((r) => (
            <li key={r.id} data-testid={`queue-row-${r.id}`} className="p-3 flex items-center gap-3">
              <div className="w-8 text-center">
                {r.high_importance ? (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500 text-emerald-950">HI</span>
                ) : (
                  <span className="text-xs font-mono text-muted-foreground">{r.priority ?? "-"}</span>
                )}
              </div>
              <Link to={`/requests/${r.id}`} className="flex-1 min-w-0">
                <div className="font-medium truncate">{r.title}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {r.channel} · {r.requester?.name} · {timeAgo(r.updated_at)}
                </div>
              </Link>
              <StatusPill status={r.status} />
              {tab === "available" && canPickup && (
                <button
                  onClick={() => pickup(r)}
                  data-testid={`pickup-btn-${r.id}`}
                  className="px-3 py-1.5 rounded-md bg-emerald-500 hover:bg-emerald-600 text-emerald-950 font-medium text-sm inline-flex items-center gap-1.5"
                >
                  <Hand className="w-4 h-4" /> Pick up
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
