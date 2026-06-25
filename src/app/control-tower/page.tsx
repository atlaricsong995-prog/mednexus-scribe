import Link from "next/link";

export default function ControlTowerPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm font-medium uppercase tracking-widest text-slate-400">
        Head Nurse · 護士長
      </p>
      <h1 className="text-3xl font-bold text-slate-900">Control Tower — Ward 5A</h1>
      <p className="text-slate-500">Live ward dashboard (read-only) — coming in Day 5.</p>
      <Link href="/" className="mt-4 text-sm text-slate-500 underline">
        ← Switch role
      </Link>
    </main>
  );
}
