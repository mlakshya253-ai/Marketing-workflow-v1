import React, { useEffect, useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { api } from "@/lib/api";
import {
  LayoutDashboard,
  Inbox as InboxIcon,
  List,
  PlusCircle,
  ShieldCheck,
  Users,
  Sun,
  Moon,
  LogOut,
  Search,
  Bell,
  Layers,
  ClipboardList,
  Activity,
} from "lucide-react";

const linksByRole = {
  requester: [
    { to: "/", label: "Home", icon: LayoutDashboard },
    { to: "/requests", label: "My Requests", icon: List },
    { to: "/new", label: "New Request", icon: PlusCircle },
    { to: "/inbox", label: "Inbox", icon: InboxIcon },
  ],
  triage: [
    { to: "/", label: "Home", icon: LayoutDashboard },
    { to: "/triage", label: "Triage", icon: ClipboardList },
    { to: "/requests", label: "All Requests", icon: List },
    { to: "/queue", label: "Queue", icon: Layers },
    { to: "/dashboard", label: "Dashboard", icon: Activity },
    { to: "/inbox", label: "Inbox", icon: InboxIcon },
    { to: "/admin", label: "Admin", icon: ShieldCheck },
  ],
  writer: [
    { to: "/", label: "Home", icon: LayoutDashboard },
    { to: "/queue", label: "Queue", icon: Layers },
    { to: "/requests", label: "All Requests", icon: List },
    { to: "/inbox", label: "Inbox", icon: InboxIcon },
  ],
  designer: [
    { to: "/", label: "Home", icon: LayoutDashboard },
    { to: "/queue", label: "Queue", icon: Layers },
    { to: "/requests", label: "All Requests", icon: List },
    { to: "/inbox", label: "Inbox", icon: InboxIcon },
  ],
  executive: [
    { to: "/", label: "Home", icon: LayoutDashboard },
    { to: "/dashboard", label: "Dashboard", icon: Activity },
    { to: "/requests", label: "All Requests", icon: List },
    { to: "/inbox", label: "Inbox", icon: InboxIcon },
  ],
};

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [unread, setUnread] = useState(0);
  const [query, setQuery] = useState("");

  const links = linksByRole[user?.role] || [];

  useEffect(() => {
    let stopped = false;
    async function poll() {
      try {
        const { data } = await api.get("/notifications/unread-count");
        if (!stopped) setUnread(data.count || 0);
      } catch (e) {
        // ignore
      }
    }
    poll();
    const t = setInterval(poll, 20000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [location.pathname]);

  const onSearch = (e) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/requests?q=${encodeURIComponent(q)}` : "/requests");
  };

  return (
    <div className="min-h-screen flex w-full bg-background text-foreground">
      {/* Sidebar (desktop) */}
      <aside
        data-testid="sidebar"
        className="hidden md:flex md:w-60 lg:w-64 flex-col border-r border-border bg-card"
      >
        <div className="h-16 px-5 flex items-center border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 grid place-items-center text-emerald-950 font-bold">
            C
          </div>
          <div className="ml-3">
            <div className="font-heading text-lg font-bold leading-none tracking-tight">Creative Hub</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Statiq Ops</div>
          </div>
        </div>
        <nav className="p-3 flex-1 space-y-0.5">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`
              }
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
              {to === "/inbox" && unread > 0 && (
                <span
                  data-testid="sidebar-unread-badge"
                  className="ml-auto text-[10px] font-semibold bg-emerald-500 text-emerald-950 rounded-full px-1.5 py-0.5 tabular-nums"
                >
                  {unread}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-border">
          <div className="text-xs text-muted-foreground mb-2 px-1">
            <div className="font-medium text-foreground truncate">{user?.name}</div>
            <div className="truncate">{user?.email}</div>
          </div>
          <div className="flex gap-2">
            <button
              data-testid="theme-toggle-btn"
              onClick={toggle}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md border border-border hover:bg-muted text-sm transition-colors"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              <span>{theme === "dark" ? "Light" : "Dark"}</span>
            </button>
            <button
              data-testid="logout-btn"
              onClick={logout}
              className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md border border-border hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive text-sm transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 border-b border-border bg-card/70 backdrop-blur-md sticky top-0 z-30 flex items-center px-4 md:px-6 gap-4">
          <div className="md:hidden font-heading font-bold text-lg brand-mark">Creative Hub</div>

          <form onSubmit={onSearch} className="flex-1 max-w-md hidden sm:block">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                data-testid="global-search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search requests by title, brief, objective…"
                className="w-full pl-9 pr-3 py-2 text-sm rounded-md bg-muted border border-transparent focus-visible:border-emerald-500 focus-visible:bg-background transition-colors"
              />
            </div>
          </form>

          <div className="ml-auto flex items-center gap-2">
            <button
              data-testid="topbar-theme-toggle-btn"
              onClick={toggle}
              className="w-9 h-9 rounded-md border border-border hover:bg-muted grid place-items-center transition-colors"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              data-testid="topbar-inbox-btn"
              onClick={() => navigate("/inbox")}
              className="relative w-9 h-9 rounded-md border border-border hover:bg-muted grid place-items-center transition-colors"
              aria-label="Inbox"
            >
              <Bell className="w-4 h-4" />
              {unread > 0 && (
                <span
                  data-testid="topbar-unread-badge"
                  className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 grid place-items-center text-[10px] font-semibold bg-emerald-500 text-emerald-950 rounded-full tabular-nums"
                >
                  {unread}
                </span>
              )}
            </button>
            <div className="hidden md:block text-sm">
              <span className="px-2 py-1 rounded-md bg-muted text-muted-foreground text-xs font-medium capitalize">
                {user?.role}
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 pb-20 md:pb-6">{children}</main>

        {/* Bottom nav (mobile) */}
        <nav
          data-testid="mobile-bottom-nav"
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/90 backdrop-blur-md flex justify-around py-2"
        >
          {links.slice(0, 5).map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] transition-colors ${
                  isActive ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                }`
              }
              data-testid={`mnav-${label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
