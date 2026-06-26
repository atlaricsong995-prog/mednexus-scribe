// Demo constants. The MVP uses a cookie role-picker instead of real auth, so the
// acting doctor is the seeded profile (Tech Spec §7).
export const WARD = "Ward 5A";

// Seeded demo identities (supabase/seed — Tech Spec §7).
export const DEMO_DOCTOR_ID = "00000000-0000-0000-0000-000000000001";

export const AUDIO_BUCKET = "audio-recordings";

// AI model ids (single source of truth — Tech Spec §4, D-009).
// LLM is Google Gemini, NOT Anthropic (D-009). STT is Groq Whisper.
export const GEMINI_MODEL = "gemini-3-flash-preview";
export const WHISPER_MODEL = "whisper-large-v3";
