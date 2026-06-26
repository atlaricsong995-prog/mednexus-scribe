import Link from "next/link";

import { NurseRealtimeProbe } from "@/components/nurse-realtime-probe";
import { WARD } from "@/lib/constants";

export default function NursePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm font-medium uppercase tracking-widest text-slate-400">
        Nurse · 護士
      </p>
      <h1 className="text-3xl font-bold text-slate-900">My Tasks — {WARD}</h1>
      <p className="text-slate-500">Live task list — coming in Day 5.</p>
      {/* Day 4: realtime channel is live now (UI in Day 5). Open DevTools to
          watch events fire when a doctor confirms a note. */}
      <NurseRealtimeProbe ward={WARD} />
      <Link href="/" className="mt-4 text-sm text-slate-500 underline">
        ← Switch role
      </Link>
    </main>
  );
}
