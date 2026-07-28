import React from "react";
import { AlertCircle, Inbox } from "lucide-react";

export function LoadingBlock({ label = "Loading…", testid = "loading-block" }) {
  return (
    <div data-testid={testid} className="p-10 grid place-items-center text-muted-foreground">
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
        <span>{label}</span>
      </div>
    </div>
  );
}

export function ErrorBlock({ error, testid = "error-block" }) {
  return (
    <div
      data-testid={testid}
      className="m-4 p-4 rounded-md border border-destructive/30 bg-destructive/5 text-destructive flex items-start gap-3"
    >
      <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
      <div className="text-sm">{error || "Something went wrong."}</div>
    </div>
  );
}

export function EmptyBlock({ title, description, action, testid = "empty-block", icon: Icon = Inbox }) {
  return (
    <div
      data-testid={testid}
      className="p-10 grid place-items-center text-center"
    >
      <div className="max-w-md">
        <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/10 grid place-items-center mb-4">
          <Icon className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="font-heading text-lg font-semibold mb-1">{title || "Nothing here yet"}</div>
        {description && <div className="text-sm text-muted-foreground mb-4">{description}</div>}
        {action}
      </div>
    </div>
  );
}
