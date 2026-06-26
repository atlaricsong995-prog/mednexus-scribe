import Link from "next/link";
import { LayoutDashboard } from "lucide-react";

import { ControlTowerBoard } from "@/components/control-tower-board";
import { getWardData } from "@/lib/server/ward-data";
import { WARD } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function ControlTowerPage() {
  const { patients, tasks } = await getWardData(WARD);

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-slate-50">
            <LayoutDashboard className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-slate-400">
              Head Nurse · 護士長
            </p>
            <h1 className="text-2xl font-bold text-slate-900">Control Tower</h1>
            <p className="text-sm text-slate-500">
              {WARD} · {patients.length} beds · read-only
            </p>
          </div>
        </div>
        <Link
          href="/"
          className="shrink-0 text-sm text-slate-500 underline-offset-4 hover:underline"
        >
          ← Switch role
        </Link>
      </header>

      <ControlTowerBoard ward={WARD} initialTasks={tasks} patients={patients} />
    </main>
  );
}
