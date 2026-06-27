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
const WHISPER_PROMPT =
  "Malaysian government hospital ward round dictation, code-switched English, Malay and Mandarin Chinese. " +
  "Malay honorifics (titles before a patient's name, NOT verbs): Encik (Mr), Puan (Mrs), Cik (Ms), Tuan (Sir). " +
  "Medications: Metformin, Amlodipine, Augmentin, Paracetamol, Insulin, Atorvastatin, Omeprazole, Frusemide. " +
  "Clinical terms: blood pressure, blood sugar, capillary blood sugar, oxygen saturation, post-op day, wound, dressing, systolic, diastolic. " +
  "Malay terms: darah tinggi (hypertension), kencing manis (diabetes), demam (fever), sakit dada (chest pain). " +
  "Mandarin terms: 血压 (blood pressure), 血糖 (blood sugar), 发烧 (fever), 胸痛 (chest pain), 胆囊 (gallbladder), 高血压 (hypertension), 糖尿病 (diabetes). " +
  "Units: mmHg, mmol/L. Dosing: BD, TDS, OD, PRN, stat.";

// Whisper biases strongly toward proper nouns it sees in the prompt, so naming the
// actual patient (e.g. "Encik Lim Ah Kow") stops their honorific+name being heard
// as a common medical word ("Encik" -> "inject"). Built per-recording.
function buildPrompt(patientName?: string): string {
  const name = patientName?.trim();
  return name ? `Patient: ${name}. ${WHISPER_PROMPT}` : WHISPER_PROMPT;
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

  return { text: result.text, language };
}
