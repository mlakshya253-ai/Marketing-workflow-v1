import React, { useEffect, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { StatusPill } from "@/components/StatusPill";
import { LoadingBlock, EmptyBlock, ErrorBlock } from "@/components/States";
import { timeAgo } from "@/lib/status";
import { PlusCircle, Search } from "lucide-react";

const SCOPES = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "awaiting_me", label: "Awaiting me" },
  { key: "completed", label: "Completed" },
];

const STATUS_OPTIONS = [
  "", "submitted", "prioritized", "in_content", "copy_awaiting_approval",
  "in_design", "on_hold", "delivered", "completed", "cancelled", "pending_cancellation",
];

export default function RequestsList() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const scope = params.get("scope") || "all";
  const q = params.get("q") || "";
  const status = params.get("status") || "";
  const channel = params.get("channel") || "";
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [channels, setChannels] = useState([]);

  const load = useCallback(async () => {
    setData(null);
    setError("");
    try {
      const { data } = await api.get("/requests", { params: { scope, q, status, channel } });
      setData(data);
    } catch (e) {
      setError(e.response?.data?.detail || "Failed to load");
      setData([]);
    }
  }, [scope, q, status, channel]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.get("/channels").then((r) => setChannels(r.data)).catch(() => {});
  }, []);

  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next);
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-bold tracking-tight">
            {user?.role === "requester" ? "My requests" : "All requests"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data ? `${data.length} matching` : "Loading…"}
          </p>
        </div>
        {user?.role === "requester" && (
          <Link
            to="/new"
            data-testid="list-new-request-btn"
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-emerald-950 font-medium px-3 py-2 rounded-md"
          >
            <PlusCircle className="w-4 h-4" /> New
          </Link>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border mb-4">
        {SCOPES.map((s) => (
          <button
            key={s.key}
            data-testid={`tab-${s.key}`}
            onClick={() => setParam("scope", s.key === "all" ? "" : s.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              scope === s.key || (s.key === "all" && !params.get("scope"))
                ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            data-testid="list-search-input"
            placeholder="Search title, brief…"
            defaultValue={q}
            onKeyDown={(e) => {
              if (e.key === "Enter") setParam("q", e.currentTarget.value);
            }}
            className="w-full pl-9 pr-3 py-2 rounded-md bg-muted border border-transparent focus-visible:border-emerald-500 focus-visible:bg-background text-sm"
          />
        </div>
        <select
          data-testid="list-status-filter"
          value={status}
          onChange={(e) => setParam("status", e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-muted border border-transparent focus-visible:border-emerald-500 focus-visible:bg-background text-sm"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.slice(1).map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
          ))}
        </select>
        <select
          data-testid="list-channel-filter"
          value={channel}
          onChange={(e) => setParam("channel", e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-muted border border-transparent focus-visible:border-emerald-500 focus-visible:bg-background text-sm"
        >
          <option value="">All channels</option>
          {channels.map((c) => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </select>
      </div>

      {error && <ErrorBlock error={error} />}
      {data === null ? (
        <LoadingBlock />
      ) : data.length === 0 ? (
        <EmptyBlock
          title="No requests match"
          description={user?.role === "requester" ? "You haven't submitted any yet." : "Adjust filters or check back soon."}
          testid="list-empty"
          action={
            user?.role === "requester" && (
              <Link
                to="/new"
                data-testid="empty-new-request-btn"
                className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-emerald-950 font-medium px-3 py-2 rounded-md text-sm"
              >
                <PlusCircle className="w-4 h-4" /> New request
              </Link>
            )
          }
        />
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          {data.map((r) => (
            <Link
              key={r.id}
              to={`/requests/${r.id}`}
              data-testid={`list-row-${r.id}`}
              className="list-row block px-4 py-3 border-b border-border last:border-b-0"
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{r.title}</span>
                    {r.high_importance && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500 text-emerald-950 shrink-0">HI</span>
                    )}
                    {r.priority !== null && r.priority !== undefined && (
                      <span className="text-[10px] font-mono text-muted-foreground shrink-0">#{r.priority}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate mt-0.5">
                    {r.channel} · by {r.requester?.name || "—"} · {timeAgo(r.updated_at)}
                    {r.designer?.name && ` · Designer: ${r.designer.name}`}
                    {r.writer?.name && ` · Writer: ${r.writer.name}`}
                  </div>
                </div>
                <StatusPill status={r.status} testid={`list-status-${r.id}`} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
