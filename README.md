# MedNexus Scribe

> Malaysia's multilingual ambient AI scribe — closing the loop between the
> doctor's voice, the nurse's tasks, and the patient's record, with built-in
> clinical governance.

MVP wedge for the **MAIC Nexus Challenge 2026** (Track T2 — AI for Healthcare).

## Ports

| Port | Route | Device |
|---|---|---|
| Doctor (主治醫生) | `/doctor` | iPad / mobile |
| Nurse (護士) | `/nurse` | mobile |
| Head Nurse Control Tower (護士長) | `/control-tower` | desktop (read-only) |

The landing page (`/`) is a demo role-picker that sets a `role` cookie and
routes into each port (real auth is out of MVP scope).

## Tech Stack

- **Next.js 14** (App Router) + TypeScript
- **Tailwind CSS 3** + shadcn/ui (Radix)
- **Supabase** — Postgres + Auth + Realtime + Storage
- **Groq Whisper** (`whisper-large-v3`) for speech-to-text
- **Google Gemini 3 Flash** for structured clinical extraction
- Deployed on **Vercel** + **Supabase Cloud**

## Local Development

```bash
pnpm install
cp .env.example .env.local   # fill in Supabase + Groq + Gemini keys
pnpm dev                     # http://localhost:3000
```

## Environment Variables

See `.env.example`. Required: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`,
`GEMINI_API_KEY`.
