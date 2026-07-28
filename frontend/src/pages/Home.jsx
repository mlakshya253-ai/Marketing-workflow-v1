import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { StatusPill } from "@/components/StatusPill";
import { LoadingBlock, EmptyBlock } from "@/components/States";
import { timeAgo } from "@/lib/status";
import { Sparkles, PlusCircle, ArrowRight, Layers, ClipboardList, Bell } from "lucide-react";

export default function Home() {
  const { user } = useAuth();
  const [requests, setRequests] = useState(null);
  const [notifs, setNotifs] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [r, n] = await Promise.all([
          api.get("/requests", { params: { scope: "awaiting_me" } }),
          api.get("/notifications"),
        ]);
        setRequests(r.data);
        setNotifs(n.data.slice(0, 5));
      } catch (e) {
        setRequests([]);
      }
    })();
  }, []);

  const roleGreeting = {
    requester: "Ready to submit your next request?",
    triage: "New submissions are waiting for triage.",
    writer: "Pick your next copy task from the queue.",
    designer: "Pick your next design task from the queue.",
    executive: "Here's a quick snapshot of the pipeline.",
  }[user?.role] || "";

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <div className="text-sm text-emerald-600 dark:text-emerald-400 font-medium mb-1 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4" /> Welcome back
          </div>
          <h1 className="font-heading text-3xl md:text-4xl font-bold tracking-tight">Hi {user?.name?.split(" ")[0]}</h1>
          <p className="text-muted-foreground mt-1">{roleGreeting}</p>
        </div>
        {user?.role === "requester" && (
          <Link
            to="/new"
            data-testid="home-new-request-btn"
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-emerald-950 font-medium px-4 py-2.5 rounded-md transition-colors"
          >
            <PlusCircle className="w-4 h-4" /> New request
          </Link>
        )}
      </div>

      {/* Quick actions grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <QuickCard
          icon={ClipboardList}
          title={user?.role === "triage" ? "Triage inbox" : "My work"}
          desc={user?.role === "triage" ? "Rank new submissions." : "Requests waiting on you."}
          to={user?.role === "triage" ? "/triage" : "/requests?scope=awaiting_me"}
          testid="home-quick-work"
        />
        {(user?.role === "writer" || user?.role === "designer" || user?.role === "triage") && (
          <QuickCard icon={Layers} title="Queue" desc="Pick up your next task." to="/queue" testid="home-quick-queue" />
        )}
        <QuickCard icon={Bell} title="Inbox" desc="Recent notifications." to="/inbox" testid="home-quick-inbox" />
      </div>

      {/* Awaiting me */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-lg font-semibold">Awaiting you</h2>
          <Link to="/requests?scope=awaiting_me" className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline">
            See all <ArrowRight className="inline w-4 h-4 -mt-0.5" />
          </Link>
        </div>
        {requests === null ? (
          <LoadingBlock />
        ) : requests.length === 0 ? (
          <EmptyBlock
            title="You're all caught up"
            description="Nothing needs your attention right now."
            testid="home-empty"
          />
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border bg-card">
            {requests.slice(0, 6).map((r) => (
              <Link
                key={r.id}
                to={`/requests/${r.id}`}
                data-testid={`home-req-${r.id}`}
                className="list-row block px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{r.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      #{r.channel} · {timeAgo(r.updated_at)}
                    </div>
                  </div>
                  <StatusPill status={r.status} />
                  {r.high_importance && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500 text-emerald-950">HI</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-heading text-lg font-semibold mb-3">Recent activity</h2>
        {notifs.length === 0 ? (
          <div className="text-sm text-muted-foreground p-6 rounded-lg border border-dashed border-border">
            No notifications yet.
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {notifs.map((n) => (
              <li key={n.id} className="px-4 py-3 flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${n.read ? "bg-muted-foreground/30" : "emerald-dot"}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{n.message}</div>
                  <div className="text-xs text-muted-foreground">{timeAgo(n.created_at)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function QuickCard({ icon: Icon, title, desc, to, testid }) {
  return (
    <Link
      to={to}
      data-testid={testid}
      className="p-4 rounded-xl border border-border bg-card hover:border-emerald-500/40 transition-colors group"
    >
      <div className="w-9 h-9 rounded-md bg-emerald-500/10 grid place-items-center mb-3">
        <Icon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
      </div>
      <div className="font-medium">{title}</div>
      <div className="text-sm text-muted-foreground mt-0.5">{desc}</div>
    </Link>
  );
}
