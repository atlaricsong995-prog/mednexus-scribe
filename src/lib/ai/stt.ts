// Speech-to-text: Gemini native audio (server-only).
//
// Replaced Groq Whisper on 2026-07-12. Whisper detects ONE language from the first
// 30s and decodes the whole clip in it, so a real ward line like
//   "Ini Encik Lim, katil dua belas, 開刀後 day two"
// locked to Chinese and came back as漢字 transliteration of the Malay ("卡提尔,
// 多巴拉"), taking the drug names down with it (Metformin -> "MED FORMIN").
// Prompt biasing cannot fix this — it is how Whisper decodes. Gemini has no
// single-language lock. Measured on the demo dictation: 5/5 byte-identical runs,
// 18/18 clinical facts, ~2.4s.
import { GoogleGenerativeAI, type GenerationConfig } from "@google/generative-ai";

import { STT_MODEL } from "@/lib/constants";

// Transcription does exactly ONE job: a faithful English rendering of what was
// said. It deliberately does NOT normalise to clinical shorthand (TDS/BD) — that
// mapping belongs to the extraction layer, which is Zod-schema-validated. Asking
// the transcriber to both translate AND normalise gave it contradictory rules
// ("render in English" vs "keep the dose exactly as dictated") and it resolved
// them differently run to run, once leaving an insulin dose as "sepuluh units".
// Fewer jobs here = less drift in front of a drug chart.
const STT_PROMPT = `Transcribe this Malaysian doctor's ward-round dictation.

The speaker code-switches WITHIN single sentences between English, Bahasa Malaysia and Mandarin Chinese. This is normal Malaysian clinical speech. Do NOT force the recording into one language.

Output a faithful ENGLISH transcript:
- Render EVERYTHING in English. No Malay or Chinese word may remain in the output.
- Write every spoken number as digits, whatever language it was spoken in (sepuluh -> 10, 一千五百 -> 1500, one gram -> 1 g).
- Spell drug names the way a drug chart spells them.
- Do NOT abbreviate the dosing frequency. Write it as spoken ("three times a day", not "TDS").
- Do NOT add, infer, or omit any clinical fact.
- If a drug name is unclear, write it phonetically in [brackets] rather than guessing.

Ward vocabulary — prefer these spellings:
Drugs: Metformin, Augmentin, Amoxicillin, Paracetamol, Aspirin, Insulin Actrapid, Furosemide, Amlodipine, Ticagrelor, Atorvastatin, Salbutamol, Doxycycline, Bisoprolol, Omeprazole.
Honorifics kept as-is before a patient name: Encik, Puan, Cik, Tuan.
Malay: katil = bed, demam = fever, teruskan = continue, batuk = cough, sikit = a little, masih ada = still has.
Routes/timing: subcutaneous, units, stat, when required.

Output ONLY the transcript. No preamble, no notes.`;

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

// Kept from the Whisper era as cheap insurance: a speech model that can't place a
// Malay honorific substitutes a homophonic English word ("Encik" -> "inject").
// Gemini has not been seen doing this, but the repair is free and only fires when
// a known mis-hearing sits directly before the patient's own name token, so
// legitimate uses ("inject insulin") are untouched.
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

// Naming the actual patient stops their honorific+name being heard as a common
// medical word, and is the one piece of per-recording context worth spending
// prompt on.
function buildPrompt(patientName?: string): string {
  const name = patientName?.trim();
  return name ? `${STT_PROMPT}\n\nThe patient is: ${name}.` : STT_PROMPT;
}

// Gemini's audio parts want a concrete audio mime type. The browser hands us
// "audio/webm;codecs=opus" (Chrome/Firefox) or "audio/mp4" (iOS Safari); strip the
// codecs suffix, which Gemini rejects.
function audioMime(mimeType: string): string {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  if (base.includes("mp4") || base.includes("m4a")) return "audio/mp4";
  if (base.startsWith("audio/")) return base;
  return "audio/webm";
}

export interface TranscriptionResult {
  text: string;
  language: string | null;
}

// Transcribe an audio blob to an English clinical transcript. Signature and return
// shape are unchanged from the Whisper implementation this replaced, so the
// /api/transcribe route and everything downstream are untouched.
export async function transcribeToEnglish(
  audio: Blob,
  mimeType: string,
  patientName?: string,
): Promise<TranscriptionResult> {
  const base64 = Buffer.from(await audio.arrayBuffer()).toString("base64");

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: STT_MODEL,
    // thinkingBudget:0 for the same reason as extraction (see gemini.ts): with
    // thinking on, this call averaged ~200s and drifted run-to-run. Off, it is
    // ~2.4s and byte-identical across runs.
    generationConfig: {
      temperature: 0,
      thinkingConfig: { thinkingBudget: 0 },
    } as GenerationConfig,
  });

  const res = await model.generateContent([
    { text: buildPrompt(patientName) },
    { inlineData: { mimeType: audioMime(mimeType), data: base64 } },
  ]);

  const text = res.response.text().trim();
  if (!text) throw new Error("Transcription returned empty text.");

  // The old Whisper verbose_json reported a detected language. Gemini is told to
  // always emit English and has no per-clip language field, and the honest answer
  // for a code-switched ward line was never one language anyway.
  return { text: fixHonorific(text, patientName), language: null };
}
