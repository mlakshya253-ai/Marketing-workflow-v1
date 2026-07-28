import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { LoadingBlock, EmptyBlock } from "@/components/States";
import { StatusPill } from "@/components/StatusPill";

export default function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/dashboard/summary").then((r) => setData(r.data));
  }, []);

  if (!data) return <LoadingBlock />;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <h1 className="font-heading text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">Live pipeline health.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Metric label="Active" value={data.counts.active} testid="metric-active" />
        <Metric label="In queue" value={data.counts.queue} testid="metric-queue" />
        <Metric label="On hold" value={data.counts.on_hold} testid="metric-onhold" />
        <Metric label="In review" value={data.counts.in_review} testid="metric-review" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
        <Metric big label="Median pickup → deliver" value={`${data.medians.pickup_to_deliver_hours} h`} testid="metric-median-deliver" />
        <Metric big label="Median queue wait" value={`${data.medians.queue_wait_hours} h`} testid="metric-median-queue" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-heading font-semibold mb-3">Blockers</h2>
          {data.blockers.length === 0 ? (
            <EmptyBlock title="No blockers" description="Everything is moving." testid="dashboard-no-blockers" />
          ) : (
            <ul className="divide-y divide-border">
              {data.blockers.map((b) => (
                <li key={b.id + b.status} className="py-2 flex items-center gap-3 text-sm">
                  <Link to={`/requests/${b.id}`} className="flex-1 min-w-0 truncate hover:underline">{b.title}</Link>
                  <span className="text-xs text-muted-foreground tabular-nums">{b.hours_stuck}h</span>
                  <StatusPill status={b.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-heading font-semibold mb-3">Volume by channel</h2>
          {data.volume_by_channel.length === 0 ? (
            <div className="text-sm text-muted-foreground">No data yet.</div>
          ) : (
            <ul className="space-y-2">
              {data.volume_by_channel.map((c) => (
                <li key={c.channel} className="flex items-center gap-3">
                  <span className="w-24 text-sm truncate">{c.channel}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${Math.min(100, (c.count / Math.max(...data.volume_by_channel.map((x) => x.count))) * 100)}%` }}
                    />
                  </div>
                  <span className="text-sm tabular-nums w-8 text-right">{c.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-heading font-semibold mb-3">Writer WIP</h2>
          {data.wip_writers.length === 0 ? (
            <div className="text-sm text-muted-foreground">No active writers.</div>
          ) : (
            <ul className="space-y-1.5">
              {data.wip_writers.map((w) => (
                <li key={w.user_id} className="flex items-center justify-between text-sm">
                  <span>{w.name}</span>
                  <span className="tabular-nums font-medium">{w.wip}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-heading font-semibold mb-3">Designer WIP</h2>
          {data.wip_designers.length === 0 ? (
            <div className="text-sm text-muted-foreground">No active designers.</div>
          ) : (
            <ul className="space-y-1.5">
              {data.wip_designers.map((w) => (
                <li key={w.user_id} className="flex items-center justify-between text-sm">
                  <span>{w.name}</span>
                  <span className="tabular-nums font-medium">{w.wip}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value, big, testid }) {
  return (
    <div data-testid={testid} className={`rounded-lg border border-border bg-card p-4 ${big ? "" : ""}`}>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`mt-1 font-heading font-bold tabular-nums ${big ? "text-3xl" : "text-2xl"}`}>{value}</div>
    </div>
  );
}
