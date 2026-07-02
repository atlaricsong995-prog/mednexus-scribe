# UI Polish — Dark Chrome + Teal + Micro-Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recolor the app with a dark "chrome" frame + teal medical accent and add subtle, branded motion, without changing any clinical flow, logic, data, or RBAC.

**Architecture:** Centralized "shell + token" approach. Flip the shadcn `--primary` token to teal (recolors all primary buttons at once), add dark-chrome + glow tokens, add a small motion toolkit (branded pulse loader, fade-in entrances, breathing live dot, highlight-on-mount), and wrap each role page in one shared `<AppShell>` for the dark top bar + optional slim side rail. Content stays light for clinical legibility.

**Tech Stack:** Next.js 14.2 (App Router), React 18, Tailwind CSS + `tailwindcss-animate`, shadcn/ui, lucide-react, pnpm.

## Global Constraints

- **Cosmetic + motion only.** Do NOT touch clinical logic, dispatch/escalation/override rules, task/alert state machines, Supabase queries, realtime subscription behavior, RBAC, or break-glass.
- **Semantic colors are frozen:** red = alert, amber = caution, emerald = OK/stable, sky = info. Never repurpose them.
- **No full dark mode.** Content areas stay light. Only the chrome (top bar / side rail) is dark.
- **Never run `next build`** — it clobbers the user's live `next dev` (blank/unstyled). Verify with `pnpm exec tsc --noEmit` and `pnpm lint` only.
- **Package manager is pnpm.** Type-check: `pnpm exec tsc --noEmit`. Lint: `pnpm lint`.
- **No test runner is configured** (no jest/vitest). The per-task test cycle is: `pnpm exec tsc --noEmit` passes + `pnpm lint` clean + the described manual visual check in the running `next dev`. Do not fabricate unit tests.
- **Respect `prefers-reduced-motion`:** transform/entrance animations must be disabled under it; keep essential state feedback (loading, focus).
- **Motion timing:** durations 150–250ms, shared easing, so nothing feels out of rhythm.
- **Commit after each task.** End commit messages with the project's Co-Authored-By trailer.

## File Structure

**Create:**
- `src/components/pulse-loader.tsx` — branded EKG/heartbeat loading mark.
- `src/components/submit-button.tsx` — server-action submit button showing `<PulseLoader>` while pending.
- `src/components/live-dot.tsx` — breathing "live/recording" dot.
- `src/components/highlight-on-mount.tsx` — wraps a newly-arrived item, flashes teal then fades.
- `src/components/app-shell.tsx` — dark top bar + optional slim side rail wrapper.

**Modify:**
- `src/app/globals.css` — teal/chrome/glow tokens + reduced-motion block.
- `tailwind.config.ts` — chrome/glow colors + keyframes/animations.
- `src/components/ui/button.tsx` — hover lift + active press + transition.
- 10 client components using `Loader2` → `<PulseLoader>` (list in Task 3).
- `src/app/page.tsx` — SubmitButton in the role-pick form + AppShell vocabulary.
- `src/app/doctor/page.tsx`, `src/app/nurse/page.tsx`, `src/app/mo/page.tsx`, `src/app/control-tower/page.tsx` — wrap in `<AppShell>`.
- `src/components/approvals-panel.tsx`, `src/components/doctor-alerts.tsx`, `src/components/control-tower-board.tsx` — fade-in + highlight-on-mount on realtime items.

---

### Task 1: Color tokens (teal primary + chrome/glow)

**Files:**
- Modify: `src/app/globals.css:12-46` (`:root` block)
- Modify: `tailwind.config.ts:12-63` (`colors`)

**Interfaces:**
- Produces: CSS tokens `--primary`, `--ring`, `--brand-chrome`, `--brand-chrome-foreground`, `--brand-glow`; Tailwind colors `chrome`, `chrome.foreground`, `glow`.

- [ ] **Step 1: Update `:root` tokens in `globals.css`**

In `src/app/globals.css`, inside `:root` change these lines:

```css
    --primary: 173 80% 40%;
    --primary-foreground: 210 40% 98%;
    --muted-foreground: 215 16% 40%;
    --border: 214 20% 88%;
    --ring: 172 66% 50%;
```

Then add these three new tokens at the end of the `:root` block (before the closing `}`):

```css
    --brand-chrome: 222 47% 11%;
    --brand-chrome-foreground: 210 40% 98%;
    --brand-glow: 172 66% 50%;
```

(Leave the `.dark` block untouched — we are not shipping dark mode.)

- [ ] **Step 2: Wire chrome/glow colors into Tailwind**

In `tailwind.config.ts`, inside `theme.extend.colors`, add after the `ring` entry:

```ts
  			chrome: {
  				DEFAULT: 'hsl(var(--brand-chrome))',
  				foreground: 'hsl(var(--brand-chrome-foreground))'
  			},
  			glow: 'hsl(var(--brand-glow))',
```

- [ ] **Step 3: Type-check and lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: no errors.

- [ ] **Step 4: Manual visual check**

In the running `next dev`, open `/` — every primary "Enter as …" button is now teal, focus rings are teal. Semantic red/amber/emerald/sky unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css tailwind.config.ts
git commit -m "feat(ui): teal primary + chrome/glow color tokens

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Motion keyframes, reduced-motion, button micro-interactions

**Files:**
- Modify: `tailwind.config.ts` (`theme.extend` → add `keyframes` + `animation`)
- Modify: `src/app/globals.css` (append reduced-motion block)
- Modify: `src/components/ui/button.tsx:8` (base class string)

**Interfaces:**
- Produces: Tailwind animations `animate-heartbeat`, `animate-fade-in-up`, `animate-breathe`, `animate-highlight`; consistent button hover/active behavior.

- [ ] **Step 1: Add keyframes + animations to Tailwind**

In `tailwind.config.ts`, inside `theme.extend` (sibling of `colors` and `borderRadius`), add:

```ts
  		keyframes: {
  			heartbeat: {
  				'0%,100%': { transform: 'scaleY(0.4)', opacity: '0.6' },
  				'40%': { transform: 'scaleY(1)', opacity: '1' },
  				'70%': { transform: 'scaleY(0.7)', opacity: '0.9' }
  			},
  			'fade-in-up': {
  				'0%': { opacity: '0', transform: 'translateY(6px)' },
  				'100%': { opacity: '1', transform: 'translateY(0)' }
  			},
  			breathe: {
  				'0%,100%': { opacity: '1', transform: 'scale(1)' },
  				'50%': { opacity: '0.55', transform: 'scale(0.85)' }
  			},
  			highlight: {
  				'0%': { backgroundColor: 'hsl(var(--brand-glow) / 0.18)' },
  				'100%': { backgroundColor: 'transparent' }
  			}
  		},
  		animation: {
  			heartbeat: 'heartbeat 1s ease-in-out infinite',
  			'fade-in-up': 'fade-in-up 0.22s ease-out both',
  			breathe: 'breathe 2s ease-in-out infinite',
  			highlight: 'highlight 1.6s ease-out both'
  		},
```

- [ ] **Step 2: Add reduced-motion guard to `globals.css`**

Append to the end of `src/app/globals.css`:

```css
@media (prefers-reduced-motion: reduce) {
  .animate-fade-in-up,
  .animate-heartbeat,
  .animate-breathe,
  .animate-highlight {
    animation: none !important;
  }
  .hover\:-translate-y-px:hover {
    transform: none !important;
  }
}
```

- [ ] **Step 3: Add hover/active to the Button base class**

In `src/components/ui/button.tsx`, the `cva(` base string currently starts with `"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors ...`. Change `transition-colors` to `transition-all duration-150` and append the lift/press utilities. The base string becomes:

```ts
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-150 hover:-translate-y-px active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:hover:translate-y-0 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
```

- [ ] **Step 4: Type-check, lint, visual check**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: no errors. In `next dev`, buttons lift slightly on hover and press down on click; with OS "Reduce Motion" on, they don't move.

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.ts src/app/globals.css src/components/ui/button.tsx
git commit -m "feat(ui): motion keyframes, reduced-motion guard, button lift/press

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Branded PulseLoader + swap all Loader2 usages

**Files:**
- Create: `src/components/pulse-loader.tsx`
- Modify (swap `Loader2` → `PulseLoader`): `src/components/confirm-button.tsx`, `locked-record.tsx`, `reset-demo-button.tsx`, `recorder.tsx`, `note-review-panel.tsx`, `med-administer-dialog.tsx`, `completion-dialog.tsx`, `approvals-panel.tsx`, `propose-order-panel.tsx`, `escalate-button.tsx` (all under `src/components/`)

**Interfaces:**
- Produces: `PulseLoader({ className }: { className?: string })` — a teal 3-bar EKG pulse; drop-in replacement for the `<Loader2 className="h-4 w-4 animate-spin" />` spinner.

- [ ] **Step 1: Create `pulse-loader.tsx`**

```tsx
import { cn } from "@/lib/utils";

// Branded loading mark: three teal bars beating like an EKG/heartbeat trace.
// Drop-in replacement for <Loader2 className="h-4 w-4 animate-spin" />.
export function PulseLoader({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn("inline-flex h-4 w-4 items-end justify-center gap-[2px]", className)}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-[2px] rounded-full bg-current animate-heartbeat"
          style={{ height: "100%", animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}
```

- [ ] **Step 2: Swap in `confirm-button.tsx` (canonical example)**

In `src/components/confirm-button.tsx`: remove `Loader2` from the lucide import on line 4 (keep `Send, CheckCircle2, ShieldAlert`), and add `import { PulseLoader } from "@/components/pulse-loader";`. Then change the submitting branch (around line 152-154) from:

```tsx
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
```

to:

```tsx
        {submitting ? (
          <PulseLoader className="text-current" />
        ) : (
          <Send className="h-4 w-4" />
        )}
```

- [ ] **Step 3: Apply the same swap to the other 9 files**

For each of `locked-record.tsx`, `reset-demo-button.tsx`, `recorder.tsx`, `note-review-panel.tsx`, `med-administer-dialog.tsx`, `completion-dialog.tsx`, `approvals-panel.tsx`, `propose-order-panel.tsx`, `escalate-button.tsx`:
1. Add `import { PulseLoader } from "@/components/pulse-loader";`.
2. Replace every `<Loader2 className="h-4 w-4 animate-spin" />` (and any size variant, e.g. `h-5 w-5`) with `<PulseLoader className="text-current" />` (carry over any size class, e.g. `<PulseLoader className="h-5 w-5 text-current" />`).
3. Remove `Loader2` from that file's `lucide-react` import (leave the other icons).

Find remaining spots with: `grep -rn "Loader2" src` — expected: no matches when done.

- [ ] **Step 4: Type-check, lint, visual check**

Run: `grep -rn "Loader2" src` (expect no output) then `pnpm exec tsc --noEmit && pnpm lint`
Expected: no `Loader2` matches, no type/lint errors. In `next dev`, trigger a dispatch/record action — the button shows the teal heartbeat instead of a spinner.

- [ ] **Step 5: Commit**

```bash
git add src/components/pulse-loader.tsx src/components
git commit -m "feat(ui): branded PulseLoader replaces spinner across actions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: SubmitButton for the server-action form (landing)

**Files:**
- Create: `src/components/submit-button.tsx`
- Modify: `src/app/page.tsx:113-119` (the `<form action={pickRole}>` block)

**Interfaces:**
- Consumes: `PulseLoader` (Task 3), `Button` from `@/components/ui/button`.
- Produces: `SubmitButton({ children, className }: { children: React.ReactNode; className?: string })` — a `type="submit"` button that shows `<PulseLoader>` + "Entering…" while its parent `<form action>` is pending, via `useFormStatus()`.

- [ ] **Step 1: Create `submit-button.tsx`**

```tsx
"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { PulseLoader } from "@/components/pulse-loader";

// Submit button for server-action <form action={...}> that shows the branded
// loading mark while the action is in flight. Must be rendered inside the form.
export function SubmitButton({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className={className} disabled={pending}>
      {pending ? (
        <>
          <PulseLoader className="text-current" />
          Entering…
        </>
      ) : (
        children
      )}
    </Button>
  );
}
```

- [ ] **Step 2: Use it in the landing form**

In `src/app/page.tsx`, add `import { SubmitButton } from "@/components/submit-button";` near the other imports, then replace the form's `<Button type="submit" className="w-full">Enter as {label}</Button>` with:

```tsx
                  <SubmitButton className="w-full">
                    Enter as {label}
                  </SubmitButton>
```

- [ ] **Step 3: Type-check, lint, visual check**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: no errors. In `next dev`, click "Enter as Doctor" — the button briefly shows the teal heartbeat + "Entering…" during the server action/redirect.

- [ ] **Step 4: Commit**

```bash
git add src/components/submit-button.tsx src/app/page.tsx
git commit -m "feat(ui): SubmitButton shows pulse during role-pick server action

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: LiveDot + HighlightOnMount components

**Files:**
- Create: `src/components/live-dot.tsx`
- Create: `src/components/highlight-on-mount.tsx`

**Interfaces:**
- Produces:
  - `LiveDot({ label, className }: { label?: string; className?: string })` — a breathing teal dot, optional label; used in the AppShell top bar and recording states.
  - `HighlightOnMount({ children, className }: { children: React.ReactNode; className?: string })` — a `<div>` that runs `animate-highlight` once on mount (teal flash → fade). Wrap a realtime list item to draw the eye when it first appears.

- [ ] **Step 1: Create `live-dot.tsx`**

```tsx
import { cn } from "@/lib/utils";

// Breathing dot for "live connection" / "recording" states.
export function LiveDot({
  label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-glow opacity-60 animate-breathe" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-glow" />
      </span>
      {label ? <span className="text-xs font-medium">{label}</span> : null}
    </span>
  );
}
```

- [ ] **Step 2: Create `highlight-on-mount.tsx`**

```tsx
"use client";

import { cn } from "@/lib/utils";

// Flash a teal highlight once when this wrapper first mounts, then fade to
// transparent. Purely visual — draws the eye to a newly-arrived realtime item.
export function HighlightOnMount({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("animate-highlight rounded-md", className)}>{children}</div>;
}
```

- [ ] **Step 3: Type-check, lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/live-dot.tsx src/components/highlight-on-mount.tsx
git commit -m "feat(ui): LiveDot breathing indicator + HighlightOnMount wrapper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: AppShell (dark top bar + optional slim side rail)

**Files:**
- Create: `src/components/app-shell.tsx`

**Interfaces:**
- Consumes: `LiveDot` (Task 5), `Link` from `next/link`, lucide icons.
- Produces: `AppShell` React component:

```ts
type NavItem = { label: string; href: string; icon: LucideIcon; active?: boolean };
function AppShell(props: {
  roleLabel: string;      // e.g. "Doctor · Attending Physician"
  title: string;          // e.g. "Today's Ward Round"
  subtitle?: string;      // e.g. "Ward 5A · 6 patients"
  icon: LucideIcon;       // role icon shown in the brand cluster
  navItems?: NavItem[];   // when provided, renders the slim side rail
  children: React.ReactNode;
}) { /* ... */ }
```

- [ ] **Step 1: Create `app-shell.tsx`**

```tsx
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Activity } from "lucide-react";

import { LiveDot } from "@/components/live-dot";
import { cn } from "@/lib/utils";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  active?: boolean;
};

export function AppShell({
  roleLabel,
  title,
  subtitle,
  icon: Icon,
  navItems,
  children,
}: {
  roleLabel: string;
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  navItems?: NavItem[];
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      {/* Dark chrome top bar */}
      <header className="sticky top-0 z-30 bg-chrome text-chrome-foreground shadow-sm">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-glow/15 text-glow">
              <Activity className="h-4 w-4" />
            </span>
            <span className="tracking-tight">MedNexus Scribe</span>
          </Link>
          <span className="hidden text-sm text-chrome-foreground/60 sm:inline">
            {subtitle ?? "Ward 5A"}
          </span>
          <div className="ml-auto flex items-center gap-4">
            <LiveDot label="Live" className="text-glow" />
            <span className="hidden text-sm text-chrome-foreground/70 md:inline">
              {roleLabel}
            </span>
            <Link
              href="/"
              className="text-sm text-chrome-foreground/70 underline-offset-4 hover:text-chrome-foreground hover:underline"
            >
              ← Switch role
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl">
        {/* Optional slim side rail — collapses to icons under lg */}
        {navItems && navItems.length > 0 ? (
          <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 flex-col gap-1 bg-chrome/95 px-2 py-4 text-chrome-foreground sm:flex">
            {navItems.map(({ label, href, icon: NavIcon, active }) => (
              <Link
                key={href}
                href={href}
                title={label}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-glow/15 text-glow"
                    : "text-chrome-foreground/70 hover:bg-white/5 hover:text-chrome-foreground",
                )}
              >
                <NavIcon className="h-4 w-4 shrink-0" />
                <span className="hidden lg:inline">{label}</span>
              </Link>
            ))}
          </aside>
        ) : null}

        {/* Light content area — page markup unchanged, just re-parented */}
        <main className="min-w-0 flex-1 px-4 py-8">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-chrome text-chrome-foreground">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {roleLabel}
              </p>
              <h1 className="text-2xl font-bold text-foreground">{title}</h1>
              {subtitle ? (
                <p className="text-sm text-muted-foreground">{subtitle}</p>
              ) : null}
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check, lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: no errors (component is not mounted yet — just compiles).

- [ ] **Step 3: Commit**

```bash
git add src/components/app-shell.tsx
git commit -m "feat(ui): AppShell dark top bar + optional slim side rail

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Adopt AppShell on the Doctor page (hero, verify first)

**Files:**
- Modify: `src/app/doctor/page.tsx:30-84` (replace `<main>` + `<header>` with `<AppShell>`)

**Interfaces:**
- Consumes: `AppShell`, `NavItem` (Task 6).

- [ ] **Step 1: Replace the page's `<main>`/`<header>` wrapper with AppShell**

In `src/app/doctor/page.tsx`, update imports: keep `Stethoscope`, add `import { LayoutDashboard } from "lucide-react";` and `import { AppShell } from "@/components/app-shell";` (drop the now-unused `Link` import and `Link`-based Switch-role markup — AppShell provides it). Replace the entire returned JSX (the `<main>…</main>` block, lines ~30-84) with:

```tsx
  return (
    <AppShell
      roleLabel="Doctor · Attending Physician"
      title="Today's Ward Round"
      subtitle={`${WARD} · ${patients?.length ?? 0} patients`}
      icon={Stethoscope}
      navItems={[
        { label: "Ward Round", href: "/doctor", icon: LayoutDashboard, active: true },
      ]}
    >
      <DoctorAlerts patients={patientLites} initialAlerts={initialAlerts} />

      <ApprovalsPanel ward={WARD} initialTasks={tasks} patients={patientLites} />

      {error && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load patients: {error.message}
        </p>
      )}

      {patients && patients.length > 0 ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {patients.map((patient) => (
            <PatientCard key={patient.id} patient={patient} />
          ))}
        </div>
      ) : (
        !error && (
          <p className="text-sm text-muted-foreground">
            No active patients in {WARD}.
          </p>
        )
      )}
    </AppShell>
  );
```

- [ ] **Step 2: Type-check, lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: no errors, no unused-import warnings (confirm `Link` removed if no longer used).

- [ ] **Step 3: Manual verification (the important one)**

In `next dev`, open `/doctor`:
- Dark top bar with brand mark, "Live" breathing dot, role label, Switch-role link.
- Slim side rail (icon under lg, icon+label at lg+); does NOT squeeze the patient grid.
- All existing panels (alerts, approvals, patient cards) render and behave exactly as before.
- Navigate into a bed detail from here — confirm the detail page still has full width (it is a separate page not yet wrapped; that's expected).

- [ ] **Step 4: Commit**

```bash
git add src/app/doctor/page.tsx
git commit -m "feat(ui): doctor dashboard adopts AppShell chrome

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Roll out AppShell to nurse, control-tower, mo, landing

**Files:**
- Modify: `src/app/nurse/page.tsx`, `src/app/control-tower/page.tsx`, `src/app/mo/page.tsx`, `src/app/page.tsx`

**Interfaces:**
- Consumes: `AppShell` (Task 6).

- [ ] **Step 1: Wrap the Nurse page**

In `src/app/nurse/page.tsx`: add `import { AppShell } from "@/components/app-shell";` and `import { ClipboardList, LayoutDashboard } from "lucide-react";` (merge with existing `ClipboardList`). Drop the `Link` import + Switch-role markup. Replace the `<main>…</main>` (lines ~24-68) so the header block is gone and `AppShell` wraps the `<WardWorklist>…</WardWorklist>`:

```tsx
  return (
    <AppShell
      roleLabel="Nurse · Ward Nurse"
      title="My Ward"
      subtitle={WARD}
      icon={ClipboardList}
      navItems={[
        { label: "My Ward", href: "/nurse", icon: LayoutDashboard, active: true },
      ]}
    >
      <WardWorklist
        ward={WARD}
        patients={patients}
        initialTasks={tasks}
        selectedBed={bed}
        basePath="/nurse"
        emptyHint="Select a patient to chart medications (MAR), vitals, and complete tasks."
      >
        {data && (
          <PatientWindow
            patient={data.patient}
            role={role}
            note={data.note}
            history={data.history}
            watchFor={data.watchFor}
            routineTasks={data.routineTasks}
            medTasks={data.medTasks}
            adHocTasks={data.adHocTasks}
          />
        )}
      </WardWorklist>
    </AppShell>
  );
```

- [ ] **Step 2: Wrap the Control-Tower and MO pages**

Open `src/app/control-tower/page.tsx` and `src/app/mo/page.tsx`. Each follows the same shape as the doctor/nurse pages (a `<main class="mx-auto … max-w-5xl …">` with an icon+title `<header>` and a Switch-role `<Link>`). For each:
1. Add `import { AppShell } from "@/components/app-shell";`.
2. Add `LayoutDashboard` to the lucide import; keep the page's existing role icon.
3. Remove the `Link` import and the Switch-role markup.
4. Replace the outer `<main>` + `<header>` with `<AppShell roleLabel=… title=… subtitle=… icon={<page's role icon>} navItems={[{ label: <title>, href: <page route>, icon: LayoutDashboard, active: true }]}>` and move the page's body content inside it (unchanged). Use the page's existing header text for `roleLabel`/`title`/`subtitle` verbatim.

- [ ] **Step 3: Align the landing page vocabulary**

In `src/app/page.tsx`, the landing keeps its standalone hero (no AppShell). Confirm the role icon badge still uses `bg-chrome text-chrome-foreground` for consistency — change the existing `bg-slate-900 text-slate-50` on the role-card icon span (around line 103) to `bg-chrome text-chrome-foreground`. Leave the rest of the hero as-is.

- [ ] **Step 4: Type-check, lint, full manual sweep**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: no errors/unused imports. In `next dev`, visit `/nurse`, `/control-tower`, `/mo`, `/`:
- Each dashboard shows the dark chrome + rail, content readable, flows intact.
- Nurse bed selection, control-tower board, MO propose/escalate all behave exactly as before.

- [ ] **Step 5: Commit**

```bash
git add src/app/nurse/page.tsx src/app/control-tower/page.tsx src/app/mo/page.tsx src/app/page.tsx
git commit -m "feat(ui): roll out AppShell to nurse, control-tower, mo; align landing

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Fade-in entrances + highlight new realtime items

**Files:**
- Modify: `src/components/approvals-panel.tsx`, `src/components/doctor-alerts.tsx`, `src/components/control-tower-board.tsx`

**Interfaces:**
- Consumes: `HighlightOnMount` (Task 5), `.animate-fade-in-up` (Task 2).

- [ ] **Step 1: Add fade-in to list items**

In each of the three files, find the JSX that maps the realtime collection to list items (e.g. `tasks.map(...)`, `alerts.map(...)`, the board rows). Add `animate-fade-in-up` to the top-level `className` of each mapped item so items ease in instead of hard-appearing. Do not change keys, data, or handlers.

- [ ] **Step 2: Wrap newly-arrived items with HighlightOnMount**

In `approvals-panel.tsx` and `doctor-alerts.tsx`, wrap each mapped item's element in `<HighlightOnMount>…</HighlightOnMount>` (add `import { HighlightOnMount } from "@/components/highlight-on-mount";`). Because React remounts on new keys, a freshly-pushed task/alert flashes teal once then fades. Keep the existing `key` on the outer wrapper element.

Example shape (adapt to the file's actual item markup):

```tsx
{tasks.map((task) => (
  <HighlightOnMount key={task.id} className="animate-fade-in-up">
    {/* existing item markup, unchanged */}
  </HighlightOnMount>
))}
```

- [ ] **Step 3: Type-check, lint, visual check**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: no errors. In `next dev`, dispatch a task as the doctor in one tab and watch the approvals/alerts feed in another — the new row eases in with a brief teal highlight. Existing realtime behavior otherwise unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/components/approvals-panel.tsx src/components/doctor-alerts.tsx src/components/control-tower-board.tsx
git commit -m "feat(ui): fade-in entrances + teal highlight on new realtime items

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Color tokens (teal primary, chrome, glow, deeper neutrals) → Task 1. ✓
- AppShell top bar + optional collapsible side rail, detail-page width preserved → Tasks 6-8 (side rail `hidden sm:flex`, content `min-w-0 flex-1`; detail pages intentionally not wrapped so they keep full width). ✓
- PulseLoader branded loader + swap existing spinners → Task 3. ✓
- SubmitButton via useFormStatus for the server-action form → Task 4. ✓
- fade-in entrances → Tasks 2 (keyframe) + 9 (applied). ✓
- LiveDot breathing indicator → Tasks 5 + 6 (mounted in top bar). ✓
- HighlightOnMount realtime highlight → Tasks 5 + 9. ✓
- Button/card micro-interactions + reduced-motion + unified timing → Task 2. ✓
- Rollout order doctor→nurse→control-tower→mo→landing → Tasks 7-8. ✓
- Non-goals (logic/data/RBAC/semantic colors untouched) → enforced in Global Constraints and each task only edits presentation. ✓

**Placeholder scan:** No TBD/TODO; every code step shows real code. The one generalized step (Task 8 Step 2 for control-tower/mo, Task 9 for item markup) gives an exact procedure + example because the target files' inner markup varies — the implementer applies the shown pattern to the actual JSX. Acceptable (repeating 4 near-identical full-file rewrites would be noise).

**Type consistency:** `PulseLoader({ className })`, `SubmitButton({ children, className })`, `LiveDot({ label, className })`, `HighlightOnMount({ children, className })`, `AppShell({ roleLabel, title, subtitle, icon, navItems, children })`, `NavItem = { label, href, icon, active? }` — names/signatures consistent across Tasks 3-9. Tailwind color `glow` and `chrome`/`chrome.foreground` used consistently with the tokens defined in Task 1. Animations `animate-heartbeat/-fade-in-up/-breathe/-highlight` defined in Task 2 and consumed in Tasks 3/5/9. ✓
