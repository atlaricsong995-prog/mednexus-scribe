# 1MED AI (One Malaysia Medical AI)

> One Malaysia, one medical AI — watching over every order.
>
> Closed-loop order dispatch for paper wards. A doctor speaks — or types — one
> order, in any mix of BM, English, and Mandarin. It is safety-checked,
> dispatched to the nurse in under two seconds, signed at the bedside,
> escalated when missed, and permanently logged. No EMR required.
>
> Not an ambient scribe: we do not record the consultation. Formerly
> "MedNexus Scribe" / "MEDJ AI".

MVP wedge for the **MAIC Nexus Challenge 2026** (Track T2 — AI for Healthcare).

**Live demo → [1med-ai.vercel.app](https://1med-ai.vercel.app)** — no login. Pick a
role on the landing page; open four tabs to watch one order cross all four.

## Ports

| Port | Route | Device |
|---|---|---|
| Doctor (主治醫生) | `/doctor` | iPad / mobile |
| Medical Officer / Resident (住院醫生) | `/mo` | iPad / mobile |
| Nurse (護士) | `/nurse` | mobile |
| Head Nurse Control Tower (護士長) | `/control-tower` | desktop (read-only) |

The MO port is deliberately **propose-only**: a resident may read the timetable,
propose an order, and escalate to the attending — never prescribe. Reaching the
narrative record costs an audited break-glass (`canBreakGlass`, `src/lib/server/role.ts`).

A shared, role-aware patient window lives at `/patient/[bed]?as=<role>` — the same
bed, masked differently depending on who opened it. Only the attending doctor sees
the record unmasked (`canViewRecord`).

**The route *is* the role.** Each port page states its own role statically, and
server actions derive the caller's role from the referer — no profile-wide session.
That is what lets four tabs of one browser hold four different roles at once (how
the demo is driven). The landing page (`/`) is a demo role-picker; the `role` cookie
it sets survives only as a fallback for a bare `/patient/[bed]` visit. Not production
auth — a demonstration of the access model (real auth is out of MVP scope).

## See the loop close (2 minutes)

On [1med-ai.vercel.app](https://1med-ai.vercel.app), click **Reset demo data**, then open
**Doctor** and **Nurse** in two tabs side by side (the route is the role, so one browser
is enough). In the Doctor tab open **Bed 12** — Encik Lim, penicillin-allergic, already
on Metformin — press **Record** and say (or use the **Type** tab, same pipeline):

> This is Mr. Lim, bed twelve. He is day two after his gallbladder operation. He now has
> a cough and a mild fever. Assessment: a chest infection on top of his diabetes. Plan:
> start Augmentin one gram three times a day for five days. Continue his Metformin one
> thousand five hundred milligrams twice a day. Also start Insulin Actrapid ten units
> subcutaneously, stat.

**Augmentin comes back framed red** — it is a penicillin, and he is allergic. That is a
hard stop: the system will not dispatch until you tick the override and *type a clinical
reason*, which then follows the drug to the nurse's screen and into the audit log.
Metformin comes back amber — he is already on it. Confirm, and the orders reach the
Nurse tab in about two seconds.

The safety verdicts are deterministic app code, not the LLM. Full 15-minute walkthrough
(all four ports, escalation, break-glass, append-only record): see the judge demo script
in the submission pack.

## Tech Stack

- **Next.js 14** (App Router) + TypeScript
- **Tailwind CSS 3** + shadcn/ui (Radix)
- **Supabase** — Postgres + Auth + Realtime + Storage
- **Google Gemini 3 Flash** (native audio) for speech-to-text — handles English/Malay/Mandarin mixed *within a single sentence*, which Whisper cannot: it locks one language per clip. See `src/lib/ai/stt.ts`.
- **Google Gemini 3 Flash** for structured clinical extraction
- Deployed on **Vercel** + **Supabase Cloud**

## Local Development

```bash
pnpm install
cp .env.example .env.local   # fill in Supabase + Gemini keys
pnpm dev                     # http://localhost:3000
```

## Environment Variables

See `.env.example`. Required: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`.
