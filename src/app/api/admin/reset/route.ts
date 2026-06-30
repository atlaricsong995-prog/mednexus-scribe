// POST /api/admin/reset — demo reset to baseline.
// Restores Ward 5A to its seeded baseline (confirmed records for MRN001–005, a
// fresh admission for MRN006) and clears the demo alert log, so a tester can wipe
// their run and start clean. Service-role only; demo build, no auth gate.
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { resetBaseline } from "@/lib/server/baseline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const summary = await resetBaseline(createAdminClient());
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Reset failed." },
      { status: 500 },
    );
  }
}
