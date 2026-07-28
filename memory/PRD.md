# Creative Hub — Product Requirements Document

## Project
Internal Creative Operations Platform for **Statiq** — replaces an Excel-based creative-request workflow with a fully-functional web app for the Marketing / Design / Content team.

## Original Problem Statement
> Build a production-quality internal web application that replaces an Excel-based creative request workflow. People submit creative requests (social posts, banners, WhatsApp campaigns, product renders). A small Triage team reviews and prioritizes into a shared queue. Content Writers draft copy first, Designers deliver via a link, Requesters review and approve. In-app notifications, live dashboard for Triage/Execs, admin panel, role-based access. Real auth (no seed users). Every button must be functional. Light+dark, emerald accent, mobile-first.

## Architecture
- **Backend**: FastAPI + Motor (MongoDB) + APScheduler + Emergent Object Storage. JWT (HS256) auth with bcrypt password hashing. Cookies + Bearer token both supported.
- **Frontend**: React + React Router + Tailwind + shadcn/ui + sonner + lucide-react + Cabinet-Grotesk/Manrope typography.
- **State machine**: submitted → prioritized → (in_content → copy_awaiting_approval →)? in_design ⇄ on_hold → delivered → completed, with pending_cancellation, cancelled, redesign loops.
- **Auto-approval**: APScheduler sweep every 5 minutes → 24h reminder + 48h auto-approve.

## User Personas
- **Requester** — Anyone in company. Submits, tracks own requests only.
- **Triage Lead** — Prioritizes queue, admin panel, cancel decisions, reassignments.
- **Content Writer** — Picks up copy tasks, drafts copy.
- **Designer** — Picks up design tasks, delivers via external URL.
- **Executive** — Read-only + Dashboard.

## Core Requirements (delivered)
- Real JWT auth; sign-up defaults to Requester; first user prompted to claim admin.
- Admin panel: role management, deactivate/reactivate (soft-only), last-admin protection, channel management.
- Full state machine with brief-locking on prioritize, audit trail on every transition.
- Intake form with "write for me" vs "self provided" + no-text-needed, up to 5 reference-image uploads (5MB each) via Emergent object storage.
- Self-pickup queue for writers/designers with WIP metrics.
- Comments with @mentions and mention notifications.
- In-app notification inbox with bell, unread count, mark-all-read.
- Dashboard: counts, medians, blockers, volume-by-channel, WIP per assignee.
- Light/dark mode; emerald accent; mobile bottom nav; keyboard focus rings.

## What's Implemented (2026-02)
- Backend: auth, admin, channels, requests state machine, file upload/download, notifications, dashboard, comments, audit, scheduler.
- Frontend: Login, Signup (with first-run admin prompt), Home, Requests list with working tabs+filters, New Request intake, Request Detail with all role-specific actions + audit timeline + comments+mentions, Triage, Queue, Inbox, Dashboard, Admin (users + channels), System status.
- Brute-force lockout keyed on both forwarded IP and email (works behind multi-pod ingress).

## Backlog / Deferred (P1)
- Working-calendar admin sub-tab (out-of-office scheduling).
- Notification-health monitoring admin sub-tab.
- Saved-filter chips in search.
- Drag-and-drop queue reordering (currently up/down buttons).
- Email/Slack notification channels (only in-app right now, by design).

## Next Tasks (P2)
- Bulk-actions on request list (bulk cancel, bulk reassign).
- CSV export of requests + audit for compliance.
- Report library — weekly cadence emails once email channel is added.
