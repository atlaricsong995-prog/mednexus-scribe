// Groq Whisper speech-to-text helper (server-only).
//
// Uses the *translations* endpoint (not transcriptions): it always outputs
// English, which is what the demo needs for mixed BM + EN + Chinese ward-round
// audio (Day 3 acceptance: "see English transcript"). whisper-large-v3 only.
import Groq, { toFile } from "groq-sdk";

import { WHISPER_MODEL } from "@/lib/constants";

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
): Promise<TranscriptionResult> {
  const ext = mimeType.includes("mp4") || mimeType.includes("m4a")
    ? "m4a"
    : "webm";
  const buffer = Buffer.from(await audio.arrayBuffer());
  const file = await toFile(buffer, `recording.${ext}`, { type: mimeType });

  const result = await getClient().audio.translations.create({
    file,
    model: WHISPER_MODEL,
    response_format: "verbose_json",
    temperature: 0,
  });

  // verbose_json returns `language` (and `duration`) at runtime, but the SDK
  // type only declares `text` — read the extra field defensively.
  const lang = (result as unknown as { language?: unknown }).language;
  const language = typeof lang === "string" ? lang : null;

  return { text: result.text, language };
}
