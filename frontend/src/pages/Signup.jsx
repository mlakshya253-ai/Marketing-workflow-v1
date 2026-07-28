import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth, formatApiErrorDetail } from "@/context/AuthContext";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";

export default function Signup() {
  const { user, register, claimAdmin, systemInfo } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showClaimPrompt, setShowClaimPrompt] = useState(false);

  useEffect(() => {
    if (user && user !== false && !user.is_first_admin) navigate("/", { replace: true });
    if (user && user !== false && user.is_first_admin) setShowClaimPrompt(true);
  }, [user, navigate]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const u = await register(email, password, name);
      toast.success("Account created");
      if (u.is_first_admin) setShowClaimPrompt(true);
      else navigate("/", { replace: true });
    } catch (e) {
      setError(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally {
      setBusy(false);
    }
  };

  const acceptAdmin = async () => {
    setBusy(true);
    try {
      await claimAdmin();
      toast.success("You're now the workspace admin (Triage Lead)");
      navigate("/", { replace: true });
    } catch (e) {
      setError(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally {
      setBusy(false);
    }
  };

  const declineAdmin = () => navigate("/", { replace: true });

  if (showClaimPrompt) {
    return (
      <div className="min-h-screen grid place-items-center p-6 bg-background">
        <div className="max-w-md w-full p-6 rounded-xl border border-border bg-card">
          <div className="w-12 h-12 rounded-full bg-emerald-500/15 grid place-items-center mb-4">
            <ShieldCheck className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="font-heading text-2xl font-bold tracking-tight">Set up your workspace</h2>
          <p className="text-sm text-muted-foreground mt-2">
            You're the first person here. There's no admin yet — becoming the admin (Triage Lead) means you can manage roles, channels, and the request queue for your team. You can promote someone else later.
          </p>
          {error && <div data-testid="claim-error" className="text-sm text-destructive mt-3">{error}</div>}
          <div className="flex gap-3 mt-6">
            <button
              onClick={acceptAdmin}
              disabled={busy}
              data-testid="claim-admin-btn"
              className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-emerald-950 font-medium py-2.5 rounded-md flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Yes, make me admin
            </button>
            <button
              onClick={declineAdmin}
              data-testid="decline-admin-btn"
              className="px-4 py-2.5 rounded-md border border-border hover:bg-muted text-sm"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-background">
      <div className="relative hidden md:flex bg-gradient-to-br from-emerald-600 via-emerald-500 to-emerald-700 text-emerald-50 p-12 items-end overflow-hidden">
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage:
            "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.25), transparent 45%), radial-gradient(circle at 70% 70%, rgba(0,0,0,0.35), transparent 55%)",
        }}/>
        <div className="relative z-10">
          <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur grid place-items-center font-bold text-2xl mb-6">C</div>
          <h1 className="font-heading text-4xl lg:text-5xl font-bold tracking-tight leading-[1.05]">
            Get started.
          </h1>
          <p className="mt-4 text-emerald-100/90 max-w-md">
            New accounts default to <strong>Requester</strong>. An admin will assign your role after you sign up.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} data-testid="signup-form" className="w-full max-w-sm space-y-5">
          <h2 className="font-heading text-2xl font-bold tracking-tight">Create account</h2>

          {systemInfo?.total_users === 0 && (
            <div className="p-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-sm" data-testid="first-signup-hint">
              You're the first person. After sign-up you'll be prompted to become the workspace admin.
            </div>
          )}

          <label className="block text-sm">
            <span className="text-muted-foreground">Name</span>
            <input
              required minLength={1} maxLength={120}
              data-testid="signup-name-input"
              value={name} onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus-visible:border-emerald-500"
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">Email</span>
            <input
              required type="email"
              data-testid="signup-email-input"
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus-visible:border-emerald-500"
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">Password</span>
            <input
              required type="password" minLength={6}
              data-testid="signup-password-input"
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus-visible:border-emerald-500"
            />
            <span className="text-xs text-muted-foreground mt-1 inline-block">Min. 6 characters.</span>
          </label>

          {error && <div data-testid="signup-error" className="text-sm text-destructive">{error}</div>}

          <button
            type="submit" disabled={busy}
            data-testid="signup-submit-btn"
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-emerald-950 font-medium py-2.5 rounded-md flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Create account
          </button>

          <div className="text-sm text-center text-muted-foreground">
            Already have one?{" "}
            <Link data-testid="link-to-login" to="/login" className="text-emerald-600 dark:text-emerald-400 font-medium hover:underline">
              Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
