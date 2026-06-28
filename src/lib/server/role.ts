// Demo-grade role resolution (Enh Day 2). The MVP has no real auth session — the
// landing page sets a `role` cookie (page.tsx pickRole). RBAC is enforced
// server-side off this cookie: the patient window decides what to render/serialise
// based on the role, so a locked record's content never reaches a non-doctor
// client. Not production security — demonstration of the access model.
import { cookies } from "next/headers";

import type { Role } from "@/lib/supabase/types";

export function getRole(): Role | null {
  const v = cookies().get("role")?.value;
  return v ? (v as Role) : null;
}

// Only the attending doctor sees the full medical record unmasked. Everyone else
// must break-glass (audited) to view it.
export function canViewRecord(role: Role | null): boolean {
  return role === "doctor";
}
