import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Server, Database, Clock } from "lucide-react";

export default function System() {
  const [health, setHealth] = useState(null);
  const [sys, setSys] = useState(null);

  useEffect(() => {
    api.get("/health").then((r) => setHealth(r.data));
    api.get("/auth/system").then((r) => setSys(r.data));
  }, []);

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <h1 className="font-heading text-2xl md:text-3xl font-bold tracking-tight">System</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">Live status of Creative Hub.</p>

      <div className="space-y-3">
        <Row icon={Server} label="Backend API" ok={!!health?.ok} detail={health?.service || "checking"} />
        <Row icon={Database} label="Registered users" ok detail={sys?.total_users ?? "…"} />
        <Row icon={Clock} label="Auto-approval scheduler" ok detail="Sweeping every 5 minutes for 24h reminders and 48h auto-approvals" />
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, ok, detail }) {
  return (
    <div className="p-4 rounded-lg border border-border bg-card flex items-center gap-3">
      <div className={`w-10 h-10 rounded-md grid place-items-center ${ok ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/15 text-rose-600"}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium">{label}</div>
        <div className="text-sm text-muted-foreground truncate">{detail}</div>
      </div>
      <span className={`text-xs px-2 py-0.5 rounded ${ok ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-rose-500/15 text-rose-600"}`}>
        {ok ? "Healthy" : "Down"}
      </span>
    </div>
  );
}
