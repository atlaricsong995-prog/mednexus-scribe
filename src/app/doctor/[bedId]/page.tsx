import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, FileClock, FolderOpen, UserCheck } from "lucide-react";

import { PatientSummary } from "@/components/patient-summary";
import { PatientWindow } from "@/components/patient-window";
import { PatientWindowModal } from "@/components/patient-window-modal";
import { NoteReviewPanel } from "@/components/note-review-panel";
import { DiscardDraftButton } from "@/components/discard-draft-button";
import { Recorder } from "@/components/recorder";
import { getRole } from "@/lib/server/role";
import {
  getPatientWindowData,
  getDraftNoteReview,
  getLatestDraftReview,
} from "@/lib/server/patient-window-data";
import { WARD } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function PatientDetailPage({
  params,
  searchParams,
}: {
  params: { bedId: string };
  searchParams: { reviewNote?: string; from?: string };
}) {
  const role = getRole();
  const data = await getPatientWindowData(
    WARD,
    decodeURIComponent(params.bedId),
    role,
  );
  if (!data) notFound();

  const { patient } = data;

  // A note re-targeted to this patient (問題 1) re-opens here for review instead of
  // the live recorder — the header/window above now correctly read this bed.
  const reviewNote = searchParams.reviewNote
    ? await getDraftNoteReview(
        searchParams.reviewNote,
        patient.id,
        patient.allergies ?? [],
      )
    : null;

  // No explicit ?reviewNote: restore the latest abandoned draft, if any.
  // Extraction persists the draft immediately, so leaving the page before
  // dispatch must not lose the note — it re-opens here to confirm or discard.
  const restoredDraft = reviewNote
    ? null
    : await getLatestDraftReview(patient.id, patient.allergies ?? []);

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-8">
      <Link
        href="/doctor"
        className="mb-6 inline-flex items-center gap-1 text-sm text-slate-500 underline-offset-4 hover:underline"
      >
        <ChevronLeft className="h-4 w-4" />
        Ward round
      </Link>

      <div className="space-y-6">
        <PatientSummary patient={patient} />

        {/* Open the full window in a modal — closing it returns here, not the ward. */}
        <PatientWindowModal
          title={`${patient.full_name} · Bed ${patient.bed_number}`}
          trigger={
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 transition-colors hover:border-slate-900"
            >
              <span className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                Open full patient window (record · MAR · timetable · instructions)
              </span>
              <span className="text-slate-400">→</span>
            </button>
          }
        >
          <PatientWindow
            patient={patient}
            role={role}
            note={data.note}
            history={data.history}
            watchFor={data.watchFor}
            routineTasks={data.routineTasks}
            medTasks={data.medTasks}
            adHocTasks={data.adHocTasks}
          />
        </PatientWindowModal>

        {reviewNote ? (
          <section>
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              <UserCheck className="h-4 w-4 shrink-0" />
              <span>
                Note moved here
                {searchParams.from ? ` from ${searchParams.from}` : ""} — you are
                now on {patient.full_name} · Bed {patient.bed_number}. Review and
                confirm.
              </span>
            </div>
            <NoteReviewPanel data={reviewNote} />
          </section>
        ) : restoredDraft ? (
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <span className="flex items-center gap-2">
                <FileClock className="h-4 w-4 shrink-0" />
                <span>
                  Unconfirmed draft restored — it was extracted earlier but never
                  dispatched. Review and confirm, or discard to dictate a new
                  note.
                </span>
              </span>
              <DiscardDraftButton noteId={restoredDraft.noteId} />
            </div>
            <NoteReviewPanel data={restoredDraft} />
          </section>
        ) : (
          <section>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400">
              Dictate note
            </h2>
            <Recorder patientId={patient.id} />
          </section>
        )}
      </div>
    </main>
  );
}
