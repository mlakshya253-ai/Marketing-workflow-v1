import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { LoadingBlock, EmptyBlock } from "@/components/States";
import { timeAgo } from "@/lib/status";
import { CheckCheck, Bell } from "lucide-react";
import { toast } from "sonner";

export default function Inbox() {
  const [items, setItems] = useState(null);
  const nav = useNavigate();

  const load = async () => {
    const { data } = await api.get("/notifications");
    setItems(data);
  };

  useEffect(() => {
    load();
  }, []);

  const clickNotif = async (n) => {
    if (!n.read) {
      await api.post(`/notifications/${n.id}/read`);
    }
    nav(`/requests/${n.request_id}`);
  };

  const markAll = async () => {
    await api.post("/notifications/mark-all-read");
    toast.success("Marked all as read");
    load();
  };

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-bold tracking-tight">Inbox</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {items?.length ? `${items.filter((i) => !i.read).length} unread of ${items.length}` : "No notifications"}
          </p>
        </div>
        <button
          onClick={markAll}
          data-testid="mark-all-read-btn"
          className="px-3 py-1.5 rounded-md border border-border hover:bg-muted text-sm inline-flex items-center gap-1.5"
        >
          <CheckCheck className="w-4 h-4" /> Mark all read
        </button>
      </div>

      {items === null ? (
        <LoadingBlock />
      ) : items.length === 0 ? (
        <EmptyBlock title="No notifications" description="You'll get pings here as things happen." testid="inbox-empty" icon={Bell} />
      ) : (
        <ul className="rounded-lg border border-border bg-card divide-y divide-border" data-testid="notifications-list">
          {items.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => clickNotif(n)}
                data-testid={`notif-${n.id}`}
                className={`w-full text-left px-4 py-3 list-row flex items-start gap-3 ${!n.read ? "bg-emerald-500/5" : ""}`}
              >
                <span className={`mt-1.5 w-2 h-2 rounded-full ${n.read ? "bg-muted-foreground/30" : "emerald-dot"}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm">{n.message}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{timeAgo(n.created_at)}</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
