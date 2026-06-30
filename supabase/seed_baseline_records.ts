// Seed/reset baseline medical records for the demo ward (問題 1).
//
// Thin CLI wrapper around the shared baseline routine in
// src/lib/server/baseline.ts (the same code the in-app reset button calls). Run:
//   node --experimental-strip-types supabase/seed_baseline_records.ts
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

import { resetBaseline } from "../src/lib/server/baseline.ts";

// Load .env.local (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
const env = Object.fromEntries(
  fs
    .readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
);

resetBaseline(sb).then((r) => {
  for (const m of r.seeded) console.log(`seeded ${m}`);
  for (const m of r.skipped) console.log(`SKIP ${m}`);
  if (r.newAdmission) console.log("MRN006 left as new admission (no note)");
  process.exit(0);
});
