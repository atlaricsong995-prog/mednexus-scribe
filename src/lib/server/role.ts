// Demo-grade role resolution (Enh Day 2, reworked 2026-07-05). The MVP has no
// real auth session. The role now rides the URL, not a profile-wide cookie, so
// four tabs of the SAME browser can hold four different roles simultaneously:
//   /doctor/*        → doctor        /nurse  → nurse
//   /control-tower   → head_nurse    /mo     → mo
//   /patient/[bed]?as=<role> — the shared window is told who opened it.
// Port pages know their own role statically; server actions and API routes
// derive it from the referer (the port page that fired them). The landing-page
// cookie remains only as a fallback for a bare /patient/[bed] visit. Not
// production security — demonstration of the access model.
import { cookies, headers } from "next/headers";

import type { Role } from "@/lib/supabase/types";

const PICKABLE: Role[] = ["doctor", "nurse", "head_nurse", "mo"];

export function parseRole(v: string | null | undefined): Role | null {
  return v && (PICKABLE as string[]).includes(v) ? (v as Role) : null;
}

// First path segment of each port → the role that port embodies.
const PORT_ROLE: Record<string, Role> = {
  doctor: "doctor",
  nurse: "nurse",
  mo: "mo",
  "control-tower": "head_nurse",
};

// Role of the WINDOW a request came from. Server actions POST to the page that
// invoked them and client fetch()es send a same-origin referer, so the port
// path (or the patient window's ?as=) identifies the acting role without any
// shared cookie state.
export function getRole(): Role | null {
  const referer = headers().get("referer");
  if (referer) {
    try {
      const url = new URL(referer);
      const seg = url.pathname.split("/")[1];
      if (seg === "patient") {
        const as = parseRole(url.searchParams.get("as"));
        if (as) return as;
      } else if (PORT_ROLE[seg]) {
        return PORT_ROLE[seg];
      }
    } catch {
      // unparseable referer — fall through to the cookie
    }
  }
  return parseRole(cookies().get("role")?.value);
}

// Only the attending doctor sees the full medical record unmasked.
export function canViewRecord(role: Role | null): boolean {
  return role === "doctor";
}

// Who may reveal a masked record via audited break-glass. Nurses and the head
// nurse (control tower) don't need the narrative record at all — they work off
// the MAR, routine timetable, tasks, and special instructions — so the record
// section is hidden from them entirely, not merely locked (問題 3 + 4). The MO
// keeps emergency break-glass.
export function canBreakGlass(role: Role | null): boolean {
  return role === "mo";
}
