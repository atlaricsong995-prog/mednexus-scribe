import Link from "next/link";

export default function DoctorPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm font-medium uppercase tracking-widest text-slate-400">
        Doctor · 主治醫生
      </p>
      <h1 className="text-3xl font-bold text-slate-900">Today&apos;s Ward Round</h1>
      <p className="text-slate-500">Patient list &amp; recorder — coming in Day 2.</p>
      <Link href="/" className="mt-4 text-sm text-slate-500 underline">
        ← Switch role
      </Link>
    </main>
  );
}
