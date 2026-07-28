import React, { useEffect, useState } from "react";
import { api, formatApiErrorDetail } from "@/lib/api";
import { LoadingBlock, EmptyBlock } from "@/components/States";
import { ROLE_LABELS } from "@/lib/status";
import { toast } from "sonner";
import { UserPlus, Ban, RotateCcw, Plus, ToggleLeft, ToggleRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const ROLES = ["requester", "triage", "writer", "designer", "executive"];

export default function Admin() {
  const [tab, setTab] = useState("users");
  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <h1 className="font-heading text-2xl md:text-3xl font-bold tracking-tight">Admin</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">Manage people and workflow settings.</p>
      <div className="flex gap-1 border-b border-border mb-5">
        {[
          { key: "users", label: "Users" },
          { key: "channels", label: "Channels" },
        ].map((t) => (
          <button
            key={t.key}
            data-testid={`admin-tab-${t.key}`}
            onClick={() => setTab(t.key)}
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
      {tab === "users" ? <UsersTab /> : <ChannelsTab />}
    </div>
  );
}

function UsersTab() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState(null);
  const load = () => api.get("/admin/users").then((r) => setUsers(r.data));

  useEffect(() => { load(); }, []);

  const setRole = async (id, role) => {
    try {
      await api.patch(`/admin/users/${id}/role`, { role });
      toast.success("Role updated");
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed");
    }
  };

  const setActive = async (id, active) => {
    try {
      await api.patch(`/admin/users/${id}/active`, { active });
      toast.success(active ? "Reactivated" : "Deactivated");
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed");
    }
  };

  if (users === null) return <LoadingBlock />;
  if (users.length === 0) return <EmptyBlock title="No users yet" description="Ask people to sign up." icon={UserPlus} />;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Email</th>
            <th className="px-3 py-2">Role</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {users.map((u) => (
            <tr key={u.id} data-testid={`admin-user-${u.id}`}>
              <td className="px-3 py-2 font-medium">{u.name}</td>
              <td className="px-3 py-2 text-muted-foreground">{u.email}</td>
              <td className="px-3 py-2">
                <select
                  value={u.role}
                  onChange={(e) => setRole(u.id, e.target.value)}
                  data-testid={`role-select-${u.id}`}
                  className="px-2 py-1 rounded border border-border bg-background text-sm"
                >
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </td>
              <td className="px-3 py-2">
                {u.active ? (
                  <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">Active</span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">Deactivated</span>
                )}
              </td>
              <td className="px-3 py-2 text-right">
                {u.id === me.id ? (
                  <span className="text-xs text-muted-foreground italic">You</span>
                ) : u.active ? (
                  <button
                    onClick={() => setActive(u.id, false)}
                    data-testid={`deactivate-${u.id}`}
                    className="px-2 py-1 rounded text-xs border border-rose-500/40 text-rose-600 hover:bg-rose-500/10 inline-flex items-center gap-1"
                  >
                    <Ban className="w-3 h-3" /> Deactivate
                  </button>
                ) : (
                  <button
                    onClick={() => setActive(u.id, true)}
                    data-testid={`reactivate-${u.id}`}
                    className="px-2 py-1 rounded text-xs border border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 inline-flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" /> Reactivate
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChannelsTab() {
  const [channels, setChannels] = useState(null);
  const [name, setName] = useState("");

  const load = () => api.get("/admin/channels").then((r) => setChannels(r.data));
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!name.trim()) return;
    try {
      await api.post("/admin/channels", { name: name.trim() });
      setName("");
      toast.success("Channel added");
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed");
    }
  };

  const toggle = async (c) => {
    try {
      await api.patch(`/admin/channels/${c.id}`, { active: !c.active });
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed");
    }
  };

  if (channels === null) return <LoadingBlock />;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Add a channel (e.g., Newsletter)"
          data-testid="channel-name-input"
          className="flex-1 px-3 py-2 rounded-md border border-border bg-background text-sm"
        />
        <button
          onClick={add}
          data-testid="add-channel-btn"
          className="px-3 py-2 rounded-md bg-emerald-500 hover:bg-emerald-600 text-emerald-950 font-medium text-sm inline-flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>
      <ul className="rounded-lg border border-border bg-card divide-y divide-border">
        {channels.map((c) => (
          <li key={c.id} className="p-3 flex items-center gap-3" data-testid={`channel-${c.id}`}>
            <span className="flex-1">{c.name}</span>
            <button
              onClick={() => toggle(c)}
              data-testid={`toggle-channel-${c.id}`}
              className="text-xs px-2 py-1 rounded border border-border hover:bg-muted inline-flex items-center gap-1"
            >
              {c.active ? <><ToggleRight className="w-4 h-4 text-emerald-500" /> Active</> : <><ToggleLeft className="w-4 h-4" /> Off</>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
