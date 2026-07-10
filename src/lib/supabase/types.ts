// Database types for MEDJ AI (Medical Jaga AI).
// Hand-written to match supabase/migrations/001_initial_schema.sql (Tech Spec §2.1).
// Regenerate with `supabase gen types typescript` once the CLI is linked.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Shapes of the jsonb columns on clinical_notes (Tech Spec §3.2 / §8).
export interface MedicalNote {
  chief_complaint: string;
  hpi: string;
  exam: string;
  assessment: string;
  plan: string;
}

export interface Medication {
  drug: string;
  dose: string;
  route: string;
  frequency: string;
  duration: string;
  // Advisory administration instruction (food timing / caution), shown to the nurse
  // on the MAR. Optional; does not affect scheduling. (Workstream E)
  admin_instruction?: string | null;
}

export interface NurseTask {
  task: string;
  when: string;
  conditions: string | null;
  priority: "low" | "normal" | "high" | "critical";
  // Controlled observation type (OBSERVATION_CATALOG key) for vital-sign tasks;
  // null for everything else. Drives fixed-unit nurse input + abnormal check.
  obs_type: "bp" | "glucose" | "temp" | "spo2" | "hr" | "rr" | null;
}

// D-008 medication safety flag, persisted on clinical_notes.safety_flags (Day 4).
// Structurally mirrors SafetyFlagSchema in lib/ai/schemas.ts (the Zod source).
export interface SafetyFlag {
  type: "allergy" | "dose" | "duplicate";
  drug: string;
  reason: string;
  severity: "critical" | "warning";
}

export type Role = "doctor" | "nurse" | "head_nurse" | "mo" | "patient";
export type NoteStatus = "draft" | "confirmed" | "archived";
export type TaskType = "medication" | "observation" | "procedure" | "other";
export type TaskPriority = "low" | "normal" | "high" | "critical";
export type TaskStatus =
  | "pending"
  | "in_progress"
  | "submitted"
  | "approved"
  | "rejected";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: Role;
          full_name: string;
          ward: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          role: Role;
          full_name: string;
          ward?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      patients: {
        Row: {
          id: string;
          mrn: string;
          full_name: string;
          age: number | null;
          gender: string | null;
          bed_number: string;
          ward: string;
          admission_date: string | null;
          diagnosis: string | null;
          allergies: string[] | null;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          mrn: string;
          full_name: string;
          age?: number | null;
          gender?: string | null;
          bed_number: string;
          ward: string;
          admission_date?: string | null;
          diagnosis?: string | null;
          allergies?: string[] | null;
          active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["patients"]["Insert"]>;
        Relationships: [];
      };
      audio_recordings: {
        Row: {
          id: string;
          patient_id: string;
          doctor_id: string;
          storage_path: string;
          duration_seconds: number | null;
          language_detected: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          patient_id: string;
          doctor_id: string;
          storage_path: string;
          duration_seconds?: number | null;
          language_detected?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["audio_recordings"]["Insert"]
        >;
        Relationships: [];
      };
      transcriptions: {
        Row: {
          id: string;
          audio_id: string;
          raw_text: string;
          source_language: string | null;
          whisper_model: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          audio_id: string;
          raw_text: string;
          source_language?: string | null;
          whisper_model?: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["transcriptions"]["Insert"]
        >;
        Relationships: [];
      };
      clinical_notes: {
        Row: {
          id: string;
          patient_id: string;
          transcription_id: string | null;
          doctor_id: string;
          medical_note: MedicalNote;
          medications: Medication[];
          nurse_tasks: NurseTask[];
          icd10_suggestions: string[] | null;
          safety_flags: SafetyFlag[];
          status: NoteStatus;
          confirmed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          patient_id: string;
          transcription_id?: string | null;
          doctor_id: string;
          medical_note: MedicalNote;
          medications: Medication[];
          nurse_tasks: NurseTask[];
          icd10_suggestions?: string[] | null;
          safety_flags?: SafetyFlag[];
          status?: NoteStatus;
          confirmed_at?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["clinical_notes"]["Insert"]
        >;
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          // Null for routine-timetable cells and MO proposals (no parent note).
          note_id: string | null;
          patient_id: string;
          ward: string;
          task_type: TaskType;
          description: string;
          obs_type: string | null;
          // Non-null marks a materialised routine-timetable cell (e.g. 'vitals:bp').
          routine_key: string | null;
          // Non-null marks a materialised MAR cell (e.g. 'med:augmentin').
          med_key: string | null;
          // A resident's proposed order awaiting attending approval (Enh Day 4).
          proposed_by_mo: boolean;
          scheduled_for: string | null;
          conditions: string | null;
          safety_alert: string | null;
          abnormal: boolean;
          priority: TaskPriority;
          status: TaskStatus;
          assigned_to: string | null;
          completed_by: string | null;
          // Demo nurse identity (name string) — who charted/administered.
          completed_by_name: string | null;
          completion_value: string | null;
          completion_notes: string | null;
          submitted_at: string | null;
          approved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          note_id?: string | null;
          patient_id: string;
          ward: string;
          task_type: TaskType;
          description: string;
          obs_type?: string | null;
          routine_key?: string | null;
          med_key?: string | null;
          proposed_by_mo?: boolean;
          scheduled_for?: string | null;
          conditions?: string | null;
          safety_alert?: string | null;
          abnormal?: boolean;
          priority?: TaskPriority;
          status?: TaskStatus;
          assigned_to?: string | null;
          completed_by?: string | null;
          completed_by_name?: string | null;
          completion_value?: string | null;
          completion_notes?: string | null;
          submitted_at?: string | null;
          approved_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tasks"]["Insert"]>;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string;
          actor_id: string | null;
          actor_role: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          actor_role?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_log"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
  };
}

// Convenience row aliases.
export type Patient = Database["public"]["Tables"]["patients"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type ClinicalNote =
  Database["public"]["Tables"]["clinical_notes"]["Row"];
export type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type AudioRecording =
  Database["public"]["Tables"]["audio_recordings"]["Row"];
export type Transcription =
  Database["public"]["Tables"]["transcriptions"]["Row"];
