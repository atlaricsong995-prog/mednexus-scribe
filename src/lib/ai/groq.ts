// Groq Whisper speech-to-text helper (server-only).
//
// Uses the *translations* endpoint (not transcriptions): it always outputs
// English, which is what the demo needs for mixed BM + EN + Chinese ward-round
// audio (Day 3 acceptance: "see English transcript"). whisper-large-v3 only.
import Groq, { toFile } from "groq-sdk";

import { WHISPER_MODEL } from "@/lib/constants";

// Domain prompt to bias Whisper toward ward-round vocabulary. Whisper uses this
// as preceding "context", which nudges spelling/word choice for drug names,
// clinical phrases, and Malay terms — cutting confusions like blood sugar ->
// blood pressure. Keep it short (Whisper only honours ~224 tokens of prompt)
// and in English, since this is the translations endpoint.
// Groq rejects Whisper prompts over 896 CHARACTERS (not tokens) — the whole
// request fails, no transcription at all. Budget: keep this base ≤ ~840 chars
// so the per-recording "Patient: <name>." prefix always fits; buildPrompt
// clamps as a last-resort guard.
const WHISPER_PROMPT =
  "Malaysian hospital ward round dictation, code-switched English, Malay and Mandarin. " +
  "Honorifics before patient names: Encik, Puan, Cik, Tuan. " +
  // Every drug the demo ward can hear dictated — spelled as the chart spells it
  // (Furosemide, NOT the old "Frusemide": med_key matching is spelling-sensitive).
  "Medications: Metformin, Amlodipine, Augmentin, Amoxicillin, Paracetamol, Aspirin, " +
  "Insulin Actrapid, Furosemide, Ticagrelor, Atorvastatin, Salbutamol, Doxycycline, Bisoprolol, Omeprazole. " +
  "Clinical terms: blood pressure, blood sugar, capillary blood glucose, oxygen saturation, " +
  "chest physiotherapy, chest X-ray, crackles, wheeze, wound dressing. " +
  "Malay: darah tinggi, kencing manis, demam. Mandarin: 血压, 血糖, 发烧, 高血压, 糖尿病. " +
  "Units: mmHg, mmol/L. Dosing: BD, TDS, QDS, OD, PRN, stat, units subcutaneously.";

const GROQ_PROMPT_MAX_CHARS = 896;

// Whisper biases strongly toward proper nouns it sees in the prompt, so naming the
// actual patient (e.g. "Encik Lim Ah Kow") stops their honorific+name being heard
// as a common medical word ("Encik" -> "inject"). Built per-recording.
function buildPrompt(patientName?: string): string {
  const name = patientName?.trim();
  const prompt = name ? `Patient: ${name}. ${WHISPER_PROMPT}` : WHISPER_PROMPT;
  // Hard clamp: over Groq's limit the API rejects the WHOLE transcription, so a
  // truncated vocabulary tail is strictly better than no transcript.
  return prompt.length > GROQ_PROMPT_MAX_CHARS
    ? prompt.slice(0, GROQ_PROMPT_MAX_CHARS)
    : prompt;
}

const MALAY_HONORIFICS = [
  "encik",
  "puan",
  "cik",
  "tuan",
  "datuk",
  "dato",
  "datin",
  "haji",
  "hajjah",
];

// Common English words Whisper's translations endpoint substitutes for a Malay
// honorific it can't place (all roughly homophonic with "Encik"/"Cik"/"Tuan").
const MISHEARD_HONORIFICS = [
  "inject",
  "injek",
  "encheck",
  "anchik",
  "ancik",
  "enzik",
  "uncle",
  "tune",
  "twan",
];

// Whisper still maps a Malay honorific onto a common English word it sounds like
// ("Encik" -> "Inject"). Prompt biasing alone didn't always catch it, so repair it
// deterministically AFTER transcription: we know the patient's real honorific +
// name from the DB, so only where a KNOWN mis-hearing word directly precedes the
// patient's own name token do we swap it for the correct honorific. Both anchors
// (mis-hearing list AND the patient's name token) keep legitimate uses of words
// like "inject" (e.g. "inject insulin") untouched.
function fixHonorific(text: string, patientName?: string): string {
  const tokens = patientName?.trim().split(/\s+/) ?? [];
  if (tokens.length < 2) return text;
  const honorific = tokens[0];
  if (!MALAY_HONORIFICS.includes(honorific.toLowerCase())) return text;
  const nameTok = tokens[1].replace(/[^A-Za-z]/g, "");
  if (!nameTok) return text;
  const re = new RegExp(
    `\\b(${MISHEARD_HONORIFICS.join("|")})\\s+(${nameTok})\\b`,
    "gi",
  );
  return text.replace(re, (_m, _pre: string, name: string) => `${honorific} ${name}`);
}

let client: Groq | null = null;

function getClient(): Groq {
  if (!client) {
    client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return client;
}

export interface TranscriptionResult {
  text: string;
  language: string | null;
}

// Translate an audio blob to an English transcript. `mimeType` decides the file
// extension Groq sees (m4a for iOS Safari mp4, webm for Chrome/Firefox).
export async function transcribeToEnglish(
  audio: Blob,
  mimeType: string,
  patientName?: string,
): Promise<TranscriptionResult> {
  const ext = mimeType.includes("mp4") || mimeType.includes("m4a")
    ? "m4a"
    : "webm";
  const buffer = Buffer.from(await audio.arrayBuffer());
  const file = await toFile(buffer, `recording.${ext}`, { type: mimeType });

  const result = await getClient().audio.translations.create({
    file,
    model: WHISPER_MODEL,
    prompt: buildPrompt(patientName),
    response_format: "verbose_json",
    temperature: 0,
  });

  // verbose_json returns `language` (and `duration`) at runtime, but the SDK
  // type only declares `text` — read the extra field defensively.
  const lang = (result as unknown as { language?: unknown }).language;
  const language = typeof lang === "string" ? lang : null;

  return { text: fixHonorific(result.text, patientName), language };
}
