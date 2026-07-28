import React from "react";
import { statusClasses, statusLabel } from "@/lib/status";

export function StatusPill({ status, testid }) {
  return (
    <span
      data-testid={testid || `status-${status}`}
      className={`status-pill ${statusClasses(status)}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {statusLabel(status)}
    </span>
  );
}
