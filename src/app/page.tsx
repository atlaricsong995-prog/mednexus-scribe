import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Stethoscope, Syringe, LayoutDashboard, UserCog } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ResetDemoButton } from "@/components/reset-demo-button";
import { SubmitButton } from "@/components/submit-button";
import type { Role } from "@/lib/supabase/types";

type RoleOption = {
  role: Extract<Role, "doctor" | "nurse" | "head_nurse" | "mo">;
  label: string;
  who: string;
  blurb: string;
  route: string;
  icon: typeof Stethoscope;
};

const ROLES: RoleOption[] = [
  {
    role: "doctor",
    label: "Doctor",
    who: "Attending Physician",
    blurb: "Ward round, dictate notes, confirm orders.",
    route: "/doctor",
    icon: Stethoscope,
  },
  {
    role: "mo",
    label: "Medical Officer",
    who: "Resident",
    blurb: "Read timetable, propose orders, escalate to attending.",
    route: "/mo",
    icon: UserCog,
  },
  {
    role: "nurse",
    label: "Nurse",
    who: "Ward Nurse",
    blurb: "Receive dispatched tasks, complete & report.",
    route: "/nurse",
    icon: Syringe,
  },
  {
    role: "head_nurse",
    label: "Head Nurse",
    who: "Charge Nurse",
    blurb: "Control tower — live ward overview (read-only).",
    route: "/control-tower",
    icon: LayoutDashboard,
  },
];

// Demo-only auth: pick a role → set a cookie → enter that port.
async function pickRole(formData: FormData) {
  "use server";
  const role = String(formData.get("role"));
  const route = String(formData.get("route"));

  cookies().set("role", role, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 8, // one shift
  });

  redirect(route);
}

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-12">
      <div className="mb-10 text-center">
        <p className="mb-2 text-sm font-medium uppercase tracking-widest text-slate-500">
          MAIC Nexus Challenge 2026 · Ward 5A
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          1MED AI
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-balance text-slate-600">
          One Malaysia Medical AI — Malaysia&apos;s multilingual ambient AI scribe,
          closing the loop between the doctor&apos;s voice, the nurse&apos;s
          tasks, and the patient&apos;s record.
        </p>
      </div>

      <section className="w-full max-w-5xl">
        <p className="mb-4 text-center text-sm font-medium text-slate-500">
          I am a…
        </p>
        <div className="stagger-fade grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map(({ role, label, who, blurb, route, icon: Icon }) => (
            <Card
              key={role}
              className="flex flex-col border-slate-200 shadow-sm transition-shadow hover:shadow-md"
            >
              <CardHeader className="items-center text-center">
                <span className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-full bg-chrome text-chrome-foreground">
                  <Icon className="h-6 w-6" />
                </span>
                <CardTitle className="text-xl">{label}</CardTitle>
                <CardDescription className="text-slate-500">
                  {who}
                </CardDescription>
              </CardHeader>
              <CardContent className="mt-auto flex flex-col gap-4">
                <p className="text-center text-sm text-slate-600">{blurb}</p>
                <form action={pickRole}>
                  <input type="hidden" name="role" value={role} />
                  <input type="hidden" name="route" value={route} />
                  <SubmitButton className="w-full">
                    Enter as {label}
                  </SubmitButton>
                </form>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <div className="mt-10">
        <ResetDemoButton />
      </div>

      <footer className="mt-12 text-center text-xs text-slate-400">
        Demo build · roles bypass real authentication for the judging walkthrough.
      </footer>
    </main>
  );
}
