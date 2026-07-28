import React, { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { api, formatApiErrorDetail, fileDownloadUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { StatusPill } from "@/components/StatusPill";
import { LoadingBlock, ErrorBlock } from "@/components/States";
import { toast } from "sonner";
import { statusLabel, timeAgo, formatDate, ROLE_LABELS } from "@/lib/status";
import {
  ArrowLeft, ExternalLink, Loader2, Send, Check, X, PauseCircle, PlayCircle,
  Ban, RotateCcw, Users, Sparkles, FileText,
} from "lucide-react";

export default function RequestDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [req, setReq] = useState(null);
  const [audit, setAudit] = useState([]);
  const [comments, setComments] = useState([]);
  const [error, setError] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const [r, a, c] = await Promise.all([
        api.get(`/requests/${id}`),
        api.get(`/requests/${id}/audit`),
        api.get(`/requests/${id}/comments`),
      ]);
      setReq(r.data);
      setAudit(a.data);
      setComments(c.data);
    } catch (e) {
      setError(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load, refreshTick]);

  const doAction = async (fn) => {
    try {
      await fn();
      setRefreshTick((n) => n + 1);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed");
    }
  };

  if (error) return <ErrorBlock error={error} />;
  if (!req) return <LoadingBlock />;

  const isRequester = user.id === req.requester_id;
  const isTriage = user.role === "triage";
  const isWriter = user.role === "writer";
  const isDesigner = user.role === "designer";

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <Link to="/requests" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <div className="flex flex-wrap items-start gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusPill status={req.status} testid="detail-status" />
            {req.high_importance && (
              <span data-testid="hi-flag" className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500 text-emerald-950">HI</span>
            )}
            {req.priority !== null && req.priority !== undefined && (
              <span className="text-[10px] font-mono text-muted-foreground">#{req.priority}</span>
            )}
            {req.brief_locked && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Brief locked</span>
            )}
            {req.revision_count > 0 && (
              <span data-testid="revision-count" className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300">
                Rev {req.revision_count}
              </span>
            )}
            {req.auto_approved && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                Auto-approved
              </span>
            )}
          </div>
          <h1 data-testid="detail-title" className="font-heading text-2xl md:text-3xl font-bold tracking-tight mt-2">{req.title}</h1>
          <div className="text-sm text-muted-foreground mt-1">
            #{req.channel} · Requester: {req.requester?.name} · Created {timeAgo(req.created_at)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Brief */}
          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Brief</h2>
            <dl className="space-y-3 text-sm">
              <div><dt className="text-muted-foreground">Objective</dt><dd className="mt-0.5 whitespace-pre-wrap">{req.objective}</dd></div>
              <div><dt className="text-muted-foreground">Target audience</dt><dd className="mt-0.5 whitespace-pre-wrap">{req.target_audience}</dd></div>
              <div><dt className="text-muted-foreground">Details</dt><dd className="mt-0.5 whitespace-pre-wrap">{req.brief}</dd></div>
              {req.desired_deadline && (
                <div><dt className="text-muted-foreground">Desired deadline (informational)</dt><dd>{req.desired_deadline}</dd></div>
              )}
              <div>
                <dt className="text-muted-foreground">Content source</dt>
                <dd className="mt-0.5">
                  {req.content_source === "write_for_me"
                    ? "Write for me (routes to writer)"
                    : req.no_text_needed
                    ? "Self-provided — no text needed"
                    : "Self-provided"}
                </dd>
              </div>
              {req.provided_copy && (
                <div><dt className="text-muted-foreground">Provided copy</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-sm p-2 rounded bg-muted">{req.provided_copy}</dd>
                </div>
              )}
            </dl>
          </section>

          {/* Reference images */}
          {req.reference_files?.length > 0 && (
            <section className="rounded-lg border border-border bg-card p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Reference images</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {req.reference_files.map((f) => (
                  <a
                    key={f.id}
                    href={fileDownloadUrl(f.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-md overflow-hidden border border-border hover:border-emerald-500/50"
                    data-testid={`ref-image-${f.id}`}
                  >
                    <img
                      src={fileDownloadUrl(f.id)}
                      alt={f.filename}
                      className="w-full aspect-square object-cover bg-muted"
                    />
                    <div className="text-[11px] p-1.5 truncate text-muted-foreground">{f.filename}</div>
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* Draft copy */}
          {(req.draft_copy || req.status === "in_content") && (
            <section className="rounded-lg border border-border bg-card p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Copy</h2>
              {req.status === "in_content" && isWriter && user.id === req.assigned_writer_id ? (
                <CopyEditor requestId={req.id} initial={req.draft_copy || ""} onDone={() => setRefreshTick((n) => n + 1)} />
              ) : req.draft_copy ? (
                <div className="whitespace-pre-wrap text-sm p-3 rounded bg-muted" data-testid="draft-copy-display">
                  {req.draft_copy}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Writer hasn't drafted copy yet.</div>
              )}
            </section>
          )}

          {/* Delivery */}
          {req.deliverable_url && (
            <section className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300 mb-2">Delivered</h2>
              <a
                href={req.deliverable_url}
                target="_blank"
                rel="noreferrer"
                data-testid="deliverable-link"
                className="inline-flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-300 hover:underline break-all"
              >
                <ExternalLink className="w-4 h-4" />
                {req.deliverable_url}
              </a>
              {req.delivery_notes && (
                <div className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{req.delivery_notes}</div>
              )}
            </section>
          )}

          {req.on_hold_reason && (
            <section className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-4 text-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300 mb-1">On hold</div>
              <div>{req.on_hold_reason}</div>
              <div className="text-xs text-muted-foreground mt-1">Since {formatDate(req.on_hold_since)}</div>
            </section>
          )}

          {/* Actions */}
          <ActionBar
            req={req}
            user={user}
            isRequester={isRequester}
            isTriage={isTriage}
            isWriter={isWriter}
            isDesigner={isDesigner}
            onAction={doAction}
          />

          {/* Comments */}
          <Comments requestId={req.id} comments={comments} onAdded={() => setRefreshTick((n) => n + 1)} />
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">People</h2>
            <PersonRow label="Requester" name={req.requester?.name} email={req.requester?.email} />
            <PersonRow label="Writer" name={req.writer?.name} email={req.writer?.email} />
            <PersonRow label="Designer" name={req.designer?.name} email={req.designer?.email} />
          </section>

          {isTriage && (req.status === "in_content" || req.status === "in_design" || req.status === "on_hold") && (
            <ReassignPanel req={req} onDone={() => setRefreshTick((n) => n + 1)} />
          )}

          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Timeline</h2>
            {audit.length === 0 ? (
              <div className="text-sm text-muted-foreground">No activity yet.</div>
            ) : (
              <ol className="space-y-3">
                {audit.map((a) => (
                  <li key={a.id} className="text-sm" data-testid={`audit-${a.action}`}>
                    <div className="flex items-start gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                      <div className="flex-1">
                        <div>
                          <span className="font-medium">{a.actor_name || "System"}</span>{" "}
                          <span className="text-muted-foreground">{a.action.replace(/_/g, " ")}</span>
                          {a.from_state && a.to_state && (
                            <span className="text-xs text-muted-foreground">
                              {" "}({statusLabel(a.from_state)} → {statusLabel(a.to_state)})
                            </span>
                          )}
                        </div>
                        {a.details && a.details.reason && <div className="text-xs text-muted-foreground mt-0.5">Reason: {a.details.reason}</div>}
                        {a.details && a.details.feedback && <div className="text-xs text-muted-foreground mt-0.5">Feedback: {a.details.feedback}</div>}
                        {a.details && a.details.url && (
                          <a href={a.details.url} target="_blank" rel="noreferrer" className="text-xs text-emerald-600 hover:underline break-all">
                            {a.details.url}
                          </a>
                        )}
                        <div className="text-xs text-muted-foreground">{timeAgo(a.created_at)}</div>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function PersonRow({ label, name, email }) {
  return (
    <div className="flex items-center gap-3 py-1.5 text-sm">
      <div className="w-8 h-8 rounded-full bg-emerald-500/15 grid place-items-center text-emerald-700 dark:text-emerald-300 font-semibold">
        {(name || "?").slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="truncate">{name || "—"}</div>
      </div>
    </div>
  );
}

// ---------- Copy editor ----------
function CopyEditor({ requestId, initial, onDone }) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!text.trim()) return toast.error("Copy is empty");
    setBusy(true);
    try {
      await api.post(`/requests/${requestId}/submit-copy`, { body: text });
      toast.success("Copy submitted for approval");
      onDone();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <textarea
        data-testid="copy-editor-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus-visible:border-emerald-500"
        placeholder="Draft the copy here…"
      />
      <button
        data-testid="submit-copy-btn"
        onClick={submit}
        disabled={busy}
        className="bg-emerald-500 hover:bg-emerald-600 text-emerald-950 font-medium px-4 py-2 rounded-md flex items-center gap-2 disabled:opacity-60"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        Submit for approval
      </button>
    </div>
  );
}

// ---------- Action bar ----------
function ActionBar({ req, user, isRequester, isTriage, isWriter, isDesigner, onAction }) {
  const [hiInput, setHiInput] = useState(req.high_importance || false);
  const [priorityInput, setPriorityInput] = useState(req.priority ?? "");
  const [feedback, setFeedback] = useState("");
  const [deliverUrl, setDeliverUrl] = useState("");
  const [deliverNotes, setDeliverNotes] = useState("");
  const [holdReason, setHoldReason] = useState("");

  const actions = [];

  // Triage: prioritize (submitted or already prioritized to update)
  if (isTriage && (req.status === "submitted" || req.status === "prioritized")) {
    actions.push(
      <div key="prioritize" className="p-3 rounded-md border border-border bg-card space-y-2">
        <div className="text-xs font-semibold uppercase text-muted-foreground">Triage</div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm inline-flex items-center gap-1.5">
            <input type="checkbox" checked={hiInput} onChange={(e) => setHiInput(e.target.checked)} data-testid="triage-hi-checkbox" />
            High importance (HI)
          </label>
          <input
            type="number" min={1}
            value={priorityInput}
            onChange={(e) => setPriorityInput(e.target.value)}
            placeholder="Priority (lower = higher)"
            data-testid="triage-priority-input"
            className="w-40 px-2 py-1.5 rounded-md border border-border bg-background text-sm"
          />
          <button
            data-testid="triage-set-priority-btn"
            onClick={() => onAction(() =>
              api.post(`/requests/${req.id}/prioritize`, {
                priority: priorityInput === "" ? null : Number(priorityInput),
                high_importance: hiInput,
              }).then(() => toast.success("Prioritized. Brief is now locked."))
            )}
            className="px-3 py-1.5 rounded-md bg-emerald-500 hover:bg-emerald-600 text-emerald-950 text-sm font-medium"
          >
            {req.status === "submitted" ? "Prioritize" : "Update priority"}
          </button>
        </div>
      </div>
    );
  }

  // Triage: cancel decision on pending_cancellation
  if (isTriage && req.status === "pending_cancellation") {
    actions.push(
      <div key="cancel-decide" className="p-3 rounded-md border border-rose-500/30 bg-rose-500/5">
        <div className="text-sm font-medium mb-2">Cancellation requested</div>
        <div className="flex gap-2">
          <button
            data-testid="triage-approve-cancel-btn"
            onClick={() => onAction(() => api.post(`/requests/${req.id}/cancel-decision`, { approve: true }).then(() => toast.success("Cancellation confirmed")))}
            className="px-3 py-1.5 rounded-md bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium"
          >
            Confirm cancellation
          </button>
          <button
            data-testid="triage-decline-cancel-btn"
            onClick={() => onAction(() => api.post(`/requests/${req.id}/cancel-decision`, { approve: false }).then(() => toast.success("Cancellation declined")))}
            className="px-3 py-1.5 rounded-md border border-border hover:bg-muted text-sm"
          >
            Decline
          </button>
        </div>
      </div>
    );
  }

  // Writer: pick up if prioritized + write_for_me
  if (isWriter && req.status === "prioritized" && req.content_source === "write_for_me" && !req.assigned_writer_id) {
    actions.push(
      <button
        key="writer-pickup"
        data-testid="pickup-writer-btn"
        onClick={() => onAction(() => api.post(`/requests/${req.id}/pickup`).then(() => toast.success("Picked up — draft the copy.")))}
        className="px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-600 text-emerald-950 font-medium text-sm inline-flex items-center gap-2"
      >
        <FileText className="w-4 h-4" /> Pick up (Content)
      </button>
    );
  }

  // Designer: pick up if prioritized+self OR in_design without designer
  if (isDesigner &&
      ((req.status === "prioritized" && req.content_source === "self_provided" && !req.assigned_designer_id) ||
       (req.status === "in_design" && !req.assigned_designer_id))) {
    actions.push(
      <button
        key="designer-pickup"
        data-testid="pickup-designer-btn"
        onClick={() => onAction(() => api.post(`/requests/${req.id}/pickup`).then(() => toast.success("Picked up — start designing.")))}
        className="px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-600 text-emerald-950 font-medium text-sm inline-flex items-center gap-2"
      >
        <Sparkles className="w-4 h-4" /> Pick up (Design)
      </button>
    );
  }

  // Requester: review copy
  if (isRequester && req.status === "copy_awaiting_approval") {
    actions.push(
      <div key="review-copy" className="p-3 rounded-md border border-border bg-card space-y-2">
        <div className="text-xs font-semibold uppercase text-muted-foreground">Review copy</div>
        <div className="flex gap-2">
          <button
            data-testid="approve-copy-btn"
            onClick={() => onAction(() => api.post(`/requests/${req.id}/review-copy`, { approve: true }).then(() => toast.success("Copy approved.")))}
            className="px-3 py-1.5 rounded-md bg-emerald-500 hover:bg-emerald-600 text-emerald-950 text-sm font-medium inline-flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" /> Approve copy
          </button>
        </div>
        <textarea
          data-testid="copy-feedback-input"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Changes required? Explain here…"
          rows={3}
          className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
        />
        <button
          data-testid="request-copy-changes-btn"
          onClick={() => {
            if (!feedback.trim()) return toast.error("Feedback required");
            onAction(() => api.post(`/requests/${req.id}/review-copy`, { approve: false, feedback }).then(() => toast.success("Changes requested.")));
          }}
          className="px-3 py-1.5 rounded-md border border-border hover:bg-muted text-sm inline-flex items-center gap-1.5"
        >
          <RotateCcw className="w-4 h-4" /> Request changes
        </button>
      </div>
    );
  }

  // Designer: hold / resume / deliver
  if (isDesigner && req.status === "in_design" && req.assigned_designer_id === user.id) {
    actions.push(
      <div key="design-actions" className="p-3 rounded-md border border-border bg-card space-y-3">
        <div className="text-xs font-semibold uppercase text-muted-foreground">Designer</div>
        <div className="space-y-2">
          <input
            data-testid="deliver-url-input"
            value={deliverUrl}
            onChange={(e) => setDeliverUrl(e.target.value)}
            placeholder="Deliverable link (SharePoint/Drive URL)"
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
          />
          <textarea
            data-testid="deliver-notes-input"
            value={deliverNotes}
            onChange={(e) => setDeliverNotes(e.target.value)}
            placeholder="Optional delivery notes…"
            rows={2}
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
          />
          <button
            data-testid="deliver-btn"
            onClick={() => {
              if (!deliverUrl.trim()) return toast.error("Deliverable link required");
              onAction(() => api.post(`/requests/${req.id}/deliver`, { deliverable_url: deliverUrl, notes: deliverNotes || null }).then(() => toast.success("Delivered!")));
            }}
            className="px-3 py-1.5 rounded-md bg-emerald-500 hover:bg-emerald-600 text-emerald-950 text-sm font-medium inline-flex items-center gap-1.5"
          >
            <Send className="w-4 h-4" /> Deliver
          </button>
        </div>
        <div className="border-t border-border pt-3 space-y-2">
          <input
            data-testid="hold-reason-input"
            value={holdReason}
            onChange={(e) => setHoldReason(e.target.value)}
            placeholder="Reason for hold (required)"
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
          />
          <button
            data-testid="hold-btn"
            onClick={() => {
              if (!holdReason.trim()) return toast.error("Reason required");
              onAction(() => api.post(`/requests/${req.id}/hold`, { reason: holdReason }).then(() => toast.success("Put on hold.")));
            }}
            className="px-3 py-1.5 rounded-md border border-border hover:bg-muted text-sm inline-flex items-center gap-1.5"
          >
            <PauseCircle className="w-4 h-4" /> Put on hold
          </button>
        </div>
      </div>
    );
  }

  // Designer / Triage: resume from on_hold
  if (req.status === "on_hold" && ((isDesigner && req.assigned_designer_id === user.id) || isTriage)) {
    actions.push(
      <button
        key="resume"
        data-testid="resume-btn"
        onClick={() => onAction(() => api.post(`/requests/${req.id}/resume`).then(() => toast.success("Resumed")))}
        className="px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-600 text-emerald-950 font-medium text-sm inline-flex items-center gap-2"
      >
        <PlayCircle className="w-4 h-4" /> Resume
      </button>
    );
  }

  // Requester: review design
  if (isRequester && req.status === "delivered") {
    actions.push(
      <div key="review-design" className="p-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 space-y-2">
        <div className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">Review delivery</div>
        <div className="text-xs text-muted-foreground">Auto-approves in 48h if no action.</div>
        <div className="flex gap-2">
          <button
            data-testid="good-to-go-btn"
            onClick={() => onAction(() => api.post(`/requests/${req.id}/review-design`, { approve: true }).then(() => toast.success("Marked complete!")))}
            className="px-3 py-1.5 rounded-md bg-emerald-500 hover:bg-emerald-600 text-emerald-950 text-sm font-medium inline-flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" /> Good to go
          </button>
        </div>
        <textarea
          data-testid="design-feedback-input"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Redesign feedback…"
          rows={3}
          className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
        />
        <button
          data-testid="request-redesign-btn"
          onClick={() => {
            if (!feedback.trim()) return toast.error("Feedback required");
            onAction(() => api.post(`/requests/${req.id}/review-design`, { approve: false, feedback }).then(() => toast.success("Redesign requested.")));
          }}
          className="px-3 py-1.5 rounded-md border border-border hover:bg-muted text-sm inline-flex items-center gap-1.5"
        >
          <RotateCcw className="w-4 h-4" /> Request redesign
        </button>
      </div>
    );
  }

  // Requester: cancel (available for active states, not terminal or already pending)
  if (isRequester &&
      !["completed", "cancelled", "pending_cancellation"].includes(req.status)) {
    actions.push(
      <button
        key="cancel"
        data-testid="cancel-request-btn"
        onClick={() => onAction(() =>
          api.post(`/requests/${req.id}/cancel`, { reason: null })
            .then((r) => toast.success(r.data.status === "cancelled" ? "Cancelled" : "Cancellation requested — awaiting Triage"))
        )}
        className="px-3 py-1.5 rounded-md border border-rose-500/40 text-rose-600 hover:bg-rose-500/10 text-sm inline-flex items-center gap-1.5"
      >
        <Ban className="w-4 h-4" /> Cancel request
      </button>
    );
  }

  if (actions.length === 0) return null;

  return (
    <section className="rounded-lg border border-border bg-background/40 p-3 space-y-3" data-testid="action-bar">
      {actions}
    </section>
  );
}

function ReassignPanel({ req, onDone }) {
  const [role] = useState(req.status === "in_content" ? "writer" : "designer");
  const [options, setOptions] = useState([]);
  const [target, setTarget] = useState("");
  useEffect(() => {
    api.get(`/admin/assignable-users`, { params: { role } }).then((r) => setOptions(r.data)).catch(() => {});
  }, [role]);
  const doReassign = async () => {
    if (!target) return toast.error("Select someone");
    try {
      await api.post(`/requests/${req.id}/reassign`, { role, user_id: target });
      toast.success("Reassigned");
      onDone();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed");
    }
  };
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
        <Users className="w-3.5 h-3.5" /> Reassign {ROLE_LABELS[role]}
      </h2>
      <select
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        data-testid="reassign-user-select"
        className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm mb-2"
      >
        <option value="">Pick a person…</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name} — {o.email}</option>)}
      </select>
      <button
        data-testid="reassign-btn"
        onClick={doReassign}
        className="w-full px-3 py-1.5 rounded-md bg-emerald-500 hover:bg-emerald-600 text-emerald-950 text-sm font-medium"
      >
        Reassign
      </button>
    </section>
  );
}

// ---------- Comments ----------
function Comments({ requestId, comments, onAdded }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [mentionSearch, setMentionSearch] = useState(null); // { q, options, position }
  const [selectedMentions, setSelectedMentions] = useState([]); // {id, name}

  const onInputChange = (e) => {
    const val = e.target.value;
    setBody(val);
    // detect @token
    const caret = e.target.selectionStart;
    const before = val.slice(0, caret);
    const m = before.match(/@([\w-]{0,20})$/);
    if (m) {
      setMentionSearch({ q: m[1] });
      api.get(`/users/search`, { params: { q: m[1] } }).then((r) => {
        setMentionSearch({ q: m[1], options: r.data });
      });
    } else {
      setMentionSearch(null);
    }
  };

  const insertMention = (u) => {
    setBody((prev) => prev.replace(/@([\w-]{0,20})$/, `@${u.name} `));
    setSelectedMentions((prev) => prev.find((m) => m.id === u.id) ? prev : [...prev, { id: u.id, name: u.name }]);
    setMentionSearch(null);
  };

  const submit = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api.post(`/requests/${requestId}/comments`, {
        body,
        mentions: selectedMentions.map((m) => m.id),
      });
      setBody("");
      setSelectedMentions([]);
      onAdded();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Comments</h2>

      {comments.length === 0 ? (
        <div className="text-sm text-muted-foreground mb-4">No comments yet — start the conversation.</div>
      ) : (
        <ul className="space-y-3 mb-4" data-testid="comments-list">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-muted grid place-items-center text-xs font-semibold shrink-0">
                {(c.author_name || "?").slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{c.author_name}</span>{" "}
                  · {ROLE_LABELS[c.author_role] || c.author_role} · {timeAgo(c.created_at)}
                </div>
                <div className="text-sm whitespace-pre-wrap mt-0.5">{c.body}</div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <textarea
          data-testid="comment-input"
          value={body}
          onChange={onInputChange}
          placeholder="Type a comment. Use @ to mention someone…"
          rows={3}
          className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus-visible:border-emerald-500"
        />
        {mentionSearch?.options?.length > 0 && (
          <div className="absolute z-10 mt-1 max-h-40 overflow-y-auto w-64 bg-popover border border-border rounded-md shadow-lg">
            {mentionSearch.options.map((u) => (
              <button
                type="button"
                key={u.id}
                onClick={() => insertMention(u)}
                data-testid={`mention-option-${u.id}`}
                className="block w-full text-left px-3 py-1.5 text-sm hover:bg-muted"
              >
                <span className="font-medium">{u.name}</span>{" "}
                <span className="text-xs text-muted-foreground">{u.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {selectedMentions.length > 0 && (
        <div className="text-xs text-muted-foreground mt-1">
          Mentioning: {selectedMentions.map((m) => "@" + m.name).join(", ")}
        </div>
      )}
      <div className="flex justify-end mt-2">
        <button
          data-testid="comment-submit-btn"
          onClick={submit}
          disabled={busy || !body.trim()}
          className="px-3 py-1.5 rounded-md bg-emerald-500 hover:bg-emerald-600 text-emerald-950 text-sm font-medium disabled:opacity-60 flex items-center gap-2"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Post
        </button>
      </div>
    </section>
  );
}
