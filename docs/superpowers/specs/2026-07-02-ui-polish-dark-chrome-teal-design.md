# UI Polish — Dark Chrome + Teal Accent + Micro-Motion

**Date:** 2026-07-02
**Status:** Design approved (user delegated final calls); pending spec review
**Scope:** Cosmetic + motion only. No changes to clinical flows, business logic, data flow, RBAC, or safety-flag semantics.

## Goal

Give doctors and nurses a UI that feels *worth the money* — a touch of "AI-tech + medical" character, slightly deeper colors, and subtle motion that makes the whole thing feel silky — **without** looking dated and **without** scaring traditional clinical users. Every change must preserve the existing workflows and logic exactly.

Direction decisions (locked with user):
- **Layout:** dark "chrome" (top bar + slim collapsible side rail) wrapping **light, readable content**.
- **Accent:** deep medical teal/cyan (`teal-500`) on a `slate-900` chrome.
- **Loading mark:** branded EKG / pulse heartbeat line (not a plain spinner).
- **Motion set (all four):** button/card micro-interactions, content fade-in entrances, realtime-update highlight, breathing/pulse live indicators.
- **Implementation strategy:** centralized "shell + token" approach (chosen over full token migration or per-page reskin).

## Non-Goals (explicitly do NOT touch)

- Clinical logic, dispatch/escalation/override rules, task/alert state machines.
- Data fetching, Supabase queries, realtime subscription behavior.
- Role-based access control and break-glass.
- Semantic color meanings: **red = alert, amber = caution, emerald = OK/stable, sky = info** stay exactly as-is.
- Content card layouts, table columns, medical-record body structure.
- No full dark-mode theme; content stays light for clinical legibility.

## Current State (baseline)

- Light theme only. Stock shadcn *neutral* palette in `globals.css`, but components hardcode `slate/red/amber/emerald/sky` Tailwind classes directly rather than using theme tokens.
- `Button` default variant already uses `bg-primary` (the `--primary` CSS token) → recoloring `--primary` recolors all primary buttons at once. Only 2 ad-hoc `bg-primary`/`text-primary` uses outside the Button component.
- `tailwindcss-animate` already installed; `Loader2 animate-spin` pattern already used in client components (e.g. `confirm-button.tsx`) for pending state.
- Geist font, shadcn Button/Card/Dialog/Toast. Four role pages (`doctor`, `mo`, `nurse`, `control-tower`) are thin wrappers over client components in `src/components/`.

## Design

### 1. Color tokens (`src/app/globals.css`)

Update `:root` (light) tokens:
- `--primary` → teal-500 `173 80% 40%` (primary buttons, key emphasis).
- `--primary-foreground` → near-white for contrast on teal.
- `--ring` → teal-400 `172 66% 50%` (focus glow).
- Neutrals (`--muted-foreground`, `--border`) nudged one step deeper toward slate for a more "settled" feel — small, subtle.

Add new semantic tokens used by the chrome/motion:
- `--brand-chrome: 222 47% 11%` (slate-900) — dark top bar / side rail background.
- `--brand-chrome-foreground` — light text/icons on chrome.
- `--brand-glow: 172 66% 50%` — teal used for live-dot halo and highlight flashes.

Wire the new tokens into `tailwind.config.ts` `colors` (e.g. `chrome`, `chrome-foreground`, `glow`). Semantic red/amber/emerald/sky classes are left untouched.

### 2. `<AppShell>` (new: `src/components/app-shell.tsx`)

A client/server-friendly layout wrapper providing the dark chrome. Props: `role` label, optional `navItems` for the side rail, `children` (page content).

- **Top bar** (always): dark (`chrome`) bar with a small brand logo mark + "MedNexus Scribe" wordmark, center ward context ("Ward 5A"), right side role name + `<LiveDot>` "live" indicator.
- **Side rail** (optional per page): slim vertical icon rail on `chrome` background. Collapsible; auto-collapses to icons on narrow viewports. Only rendered where it adds value (role dashboards). **Detail/content-dense pages preserve full content width** — side rail is contextual, never squeezes medical-record or bed-detail layouts.
- Content area keeps the current light background and existing page markup unchanged (pages just get wrapped).

Rollout order (verify each before next): **doctor → nurse → control-tower → mo → landing**. Landing keeps its standalone hero but adopts the teal primary + dark-chrome vocabulary for consistency.

### 3. Motion toolkit (new components/utilities)

| Item | Purpose | Technique |
|---|---|---|
| `<PulseLoader>` (`src/components/pulse-loader.tsx`) | Teal EKG heartbeat line looping; used as the button loading mark | CSS keyframes on an SVG/stroke path |
| `<SubmitButton>` (`src/components/submit-button.tsx`) | Wrap `<form action={...}>` server-action submits; shows `<PulseLoader>` while pending | `useFormStatus()` |
| `.animate-fade-in-up` utility | Cards/lists fade + slide-up on mount instead of hard-appearing | `tailwind.config.ts` keyframes (animate plugin) |
| `<LiveDot>` (`src/components/live-dot.tsx`) | Breathing dot for "live connection" / "recording" states | CSS pulse animation |
| `<HighlightOnMount>` (`src/components/highlight-on-mount.tsx`) | New task/alert briefly flashes teal then fades | CSS transition on mount |

Existing manual `Loader2 animate-spin` usages (e.g. `confirm-button.tsx`) are swapped to `<PulseLoader>` for a consistent branded loading feel. No change to when/why the loading state fires.

### 4. "Silky" details (global)

- Buttons/cards: unified `transition`, hover `translate-y-[-1px]` + slightly deeper shadow, `active` micro-press. Applied via the Button component and a shared card hover utility, not per-instance duplication.
- **`prefers-reduced-motion`:** disable transform/entrance animations; keep essential state feedback (loading, focus). Clinical-compliance friendly.
- Unified timing: 150–250ms durations and a single shared easing, so nothing feels out of rhythm.

### 5. Files touched (summary)

- **Edit:** `src/app/globals.css`, `tailwind.config.ts`, `src/components/ui/button.tsx` (hover/active + keep `bg-primary`), the four role pages + `src/app/page.tsx` (wrap in `<AppShell>`), and the handful of client components that currently render `Loader2`/ad-hoc slate emphasis conflicting with teal.
- **Add:** `app-shell.tsx`, `pulse-loader.tsx`, `submit-button.tsx`, `live-dot.tsx`, `highlight-on-mount.tsx`.
- **Do NOT touch:** clinical logic, data/realtime layer, RBAC, semantic colors, content card internals.

## Testing & Verification

- Type check: `tsc --noEmit`. Lint: project lint. **Never run `next build`** (clobbers the user's live `next dev` — known issue).
- Manual walkthrough per role page after wrapping, confirming: flows unchanged, buttons show pulse on action, content readable, side rail never squeezes detail pages, reduced-motion respected.
- Regression focus: confirm/dispatch, escalation, override gate, MAR signing still behave identically (visual-only changes).

## Risks

- Side rail squeezing content-dense pages → mitigated by making it optional/collapsible and preserving detail-page width.
- Teal `--primary` clashing with existing ad-hoc slate emphasis → audit and adjust the few conflicting spots.
- Motion feeling heavy → keep durations short, respect reduced-motion.
