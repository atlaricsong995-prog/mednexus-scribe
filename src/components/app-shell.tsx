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
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-4 px-4">
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

      <div className="mx-auto flex w-full max-w-7xl">
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
