import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth, formatApiErrorDetail } from "@/context/AuthContext";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function Login() {
  const { user, login, systemInfo } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user && user !== false) navigate("/", { replace: true });
  }, [user, navigate]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email, password);
      toast.success("Signed in");
      navigate("/", { replace: true });
    } catch (e) {
      setError(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-background">
      {/* Brand panel */}
      <div className="relative hidden md:flex bg-gradient-to-br from-emerald-600 via-emerald-500 to-emerald-700 text-emerald-50 p-12 items-end overflow-hidden">
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.25), transparent 45%), radial-gradient(circle at 80% 60%, rgba(0,0,0,0.35), transparent 55%)",
        }}/>
        <div className="relative z-10">
          <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur grid place-items-center font-bold text-2xl mb-6">C</div>
          <h1 className="font-heading text-4xl lg:text-5xl font-bold tracking-tight leading-[1.05]">
            One queue.<br/>One truth.<br/>Zero spreadsheets.
          </h1>
          <p className="mt-4 text-emerald-100/90 max-w-md">
            Creative Hub is the internal operations layer for the Statiq Marketing, Design, and Content team — request in, prioritized, drafted, designed, shipped.
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6">
        <form
          onSubmit={submit}
          data-testid="login-form"
          className="w-full max-w-sm space-y-5"
        >
          <div>
            <div className="md:hidden font-heading font-bold text-2xl brand-mark mb-6">Creative Hub</div>
            <h2 className="font-heading text-2xl font-bold tracking-tight">Sign in</h2>
            <p className="text-sm text-muted-foreground mt-1">Use your work email.</p>
          </div>

          {systemInfo?.total_users === 0 && (
            <div data-testid="first-run-hint" className="p-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-sm">
              First time here? <Link to="/signup" className="font-medium text-emerald-600 dark:text-emerald-400 underline">Create the first account</Link> — you'll be prompted to become the workspace admin.
            </div>
          )}

          <div className="space-y-3">
            <label className="block text-sm">
              <span className="text-muted-foreground">Email</span>
              <input
                type="email"
                required
                data-testid="login-email-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus-visible:border-emerald-500"
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Password</span>
              <input
                type="password"
                required
                data-testid="login-password-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus-visible:border-emerald-500"
              />
            </label>
          </div>

          {error && (
            <div data-testid="login-error" className="text-sm text-destructive">{error}</div>
          )}

          <button
            type="submit"
            disabled={busy}
            data-testid="login-submit-btn"
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-emerald-950 font-medium py-2.5 rounded-md transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Sign in
          </button>

          <div className="text-sm text-center text-muted-foreground">
            No account?{" "}
            <Link data-testid="link-to-signup" to="/signup" className="text-emerald-600 dark:text-emerald-400 font-medium hover:underline">
              Create one
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
