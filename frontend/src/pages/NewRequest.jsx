import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiErrorDetail } from "@/lib/api";
import { toast } from "sonner";
import { UploadCloud, X, Loader2 } from "lucide-react";

export default function NewRequest() {
  const nav = useNavigate();
  const [channels, setChannels] = useState([]);
  const [form, setForm] = useState({
    title: "",
    objective: "",
    target_audience: "",
    brief: "",
    channel: "",
    desired_deadline: "",
    content_source: "write_for_me",
    provided_copy: "",
    no_text_needed: false,
    reference_file_ids: [],
  });
  const [files, setFiles] = useState([]); // {id, filename}
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/channels").then((r) => {
      setChannels(r.data);
      setForm((f) => ({ ...f, channel: f.channel || (r.data[0]?.name || "") }));
    });
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleFiles = async (fileList) => {
    const arr = Array.from(fileList);
    if (files.length + arr.length > 5) {
      toast.error("Max 5 files");
      return;
    }
    setUploading(true);
    for (const f of arr) {
      if (f.size > 5 * 1024 * 1024) {
        toast.error(`${f.name} is over 5MB`);
        continue;
      }
      const fd = new FormData();
      fd.append("file", f);
      try {
        const { data } = await api.post("/files/upload", fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        setFiles((prev) => [...prev, { id: data.id, filename: data.filename }]);
      } catch (e) {
        toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Upload failed");
      }
    }
    setUploading(false);
  };

  const removeFile = (id) => setFiles((prev) => prev.filter((f) => f.id !== id));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const payload = {
        ...form,
        reference_file_ids: files.map((f) => f.id),
        desired_deadline: form.desired_deadline || null,
        provided_copy: form.content_source === "self_provided" && !form.no_text_needed ? form.provided_copy : null,
      };
      const { data } = await api.post("/requests", payload);
      toast.success("Request submitted");
      nav(`/requests/${data.id}`);
    } catch (e) {
      setError(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <h1 className="font-heading text-2xl md:text-3xl font-bold tracking-tight">New request</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Give the team enough context to get it right the first time.
      </p>

      <form onSubmit={submit} className="space-y-6" data-testid="new-request-form">
        <Field label="Title" required>
          <input
            data-testid="req-title-input"
            value={form.title} onChange={(e) => set("title", e.target.value)}
            required maxLength={200}
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus-visible:border-emerald-500"
          />
        </Field>
        <Field label="Objective" required hint="What outcome are you after?">
          <textarea
            data-testid="req-objective-input"
            value={form.objective} onChange={(e) => set("objective", e.target.value)}
            required rows={2} maxLength={1000}
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus-visible:border-emerald-500"
          />
        </Field>
        <Field label="Target audience" required>
          <input
            data-testid="req-audience-input"
            value={form.target_audience} onChange={(e) => set("target_audience", e.target.value)}
            required maxLength={500}
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus-visible:border-emerald-500"
          />
        </Field>
        <Field label="Brief" required hint="Full context, tone, do's and don'ts.">
          <textarea
            data-testid="req-brief-input"
            value={form.brief} onChange={(e) => set("brief", e.target.value)}
            required rows={5} maxLength={8000}
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus-visible:border-emerald-500"
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Channel" required>
            <select
              data-testid="req-channel-select"
              value={form.channel} onChange={(e) => set("channel", e.target.value)}
              required
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus-visible:border-emerald-500"
            >
              {channels.map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Desired deadline" hint="Informational — not a hard commitment.">
            <input
              type="date"
              data-testid="req-deadline-input"
              value={form.desired_deadline} onChange={(e) => set("desired_deadline", e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus-visible:border-emerald-500"
            />
          </Field>
        </div>

        {/* Content source */}
        <div>
          <div className="text-sm font-medium mb-2">Content</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <RadioCard
              testid="content-write-for-me"
              selected={form.content_source === "write_for_me"}
              onClick={() => set("content_source", "write_for_me")}
              title="Write the content for me"
              desc="Routes to a Content Writer first."
            />
            <RadioCard
              testid="content-self-provided"
              selected={form.content_source === "self_provided"}
              onClick={() => set("content_source", "self_provided")}
              title="I'll provide the content"
              desc="Skips straight to design."
            />
          </div>

          {form.content_source === "self_provided" && (
            <div className="mt-4 space-y-3">
              <label className="text-sm inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  data-testid="no-text-needed-checkbox"
                  checked={form.no_text_needed}
                  onChange={(e) => set("no_text_needed", e.target.checked)}
                />
                No text needed (design only)
              </label>
              {!form.no_text_needed && (
                <textarea
                  data-testid="req-provided-copy-input"
                  value={form.provided_copy}
                  onChange={(e) => set("provided_copy", e.target.value)}
                  placeholder="Paste the copy for the designer…"
                  rows={4}
                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus-visible:border-emerald-500"
                />
              )}
            </div>
          )}
        </div>

        {/* File uploader */}
        <div>
          <div className="text-sm font-medium mb-2">Reference images <span className="text-muted-foreground font-normal">(max 5 · 5MB each)</span></div>
          <label
            className="block border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-emerald-500/50 transition-colors"
            data-testid="file-drop-zone"
          >
            <input
              type="file"
              multiple accept="image/*"
              className="sr-only"
              onChange={(e) => handleFiles(e.target.files)}
              data-testid="file-input"
            />
            <UploadCloud className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <div className="text-sm">{uploading ? "Uploading…" : "Click to browse or drop images"}</div>
            <div className="text-xs text-muted-foreground mt-1">PNG, JPG, GIF, WebP</div>
          </label>
          {files.length > 0 && (
            <ul className="mt-3 space-y-1.5" data-testid="uploaded-files-list">
              {files.map((f) => (
                <li key={f.id} className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-md bg-muted">
                  <span className="flex-1 truncate">{f.filename}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(f.id)}
                    data-testid={`remove-file-${f.id}`}
                    className="p-0.5 rounded hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <div data-testid="req-error" className="text-sm text-destructive">{error}</div>}

        <div className="flex gap-3">
          <button
            type="submit" disabled={busy || uploading}
            data-testid="req-submit-btn"
            className="bg-emerald-500 hover:bg-emerald-600 text-emerald-950 font-medium px-5 py-2.5 rounded-md disabled:opacity-60 flex items-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Submit request
          </button>
          <button
            type="button"
            onClick={() => nav(-1)}
            className="px-4 py-2.5 rounded-md border border-border hover:bg-muted text-sm"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, required, hint, children }) {
  return (
    <label className="block text-sm">
      <div className="flex items-baseline justify-between mb-1">
        <span className="font-medium">
          {label} {required && <span className="text-emerald-600">*</span>}
        </span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

function RadioCard({ selected, onClick, title, desc, testid }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className={`text-left p-3 rounded-lg border transition-colors ${
        selected ? "border-emerald-500 bg-emerald-500/5" : "border-border hover:border-muted-foreground"
      }`}
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
    </button>
  );
}
